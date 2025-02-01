const toggleRecord = document.getElementById('toggleRecord');
const recordingIndicator = document.getElementById('recordingIndicator');
const audioUpload = document.getElementById('audioUpload');
const resultsDiv = document.getElementById('results');
const timerDisplay = document.getElementById('timer');
const progressLine = document.getElementById('progress-line');
const processingSpinner = document.getElementById('processingSpinner');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let timeLeft = 180; // 3 minutes in seconds
let timerInterval = null;
let startTime = null;

const API_KEY = '2785097c3f2e45c5b2f68afd73b045a5'; // Replace with your API key if needed

// Check and return a supported MIME type, or return empty string if none are supported
const getSupportedMimeType = () => {
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return 'audio/webm';
  } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return 'audio/mp4';
  }
  return '';
};

// Timer functions
function startTimer() {
  startTime = Date.now();
  timerDisplay.textContent = formatTime(timeLeft);
  progressLine.style.width = '100%';
  
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    timeLeft = 180 - Math.floor(elapsed / 1000);
    
    timerDisplay.textContent = formatTime(timeLeft);
    const progressPercent = (elapsed / (180 * 1000)) * 100;
    progressLine.style.width = `${100 - progressPercent}%`;
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (isRecording) toggleRecord.click();
    }
  }, 50);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

// Show/hide processing spinner
function showProcessingSpinner() {
  processingSpinner.classList.remove('hidden');
}
function hideProcessingSpinner() {
  processingSpinner.classList.add('hidden');
}

// Toggle recording event handler
toggleRecord.addEventListener('click', async () => {
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      mediaRecorder = new MediaRecorder(stream, options);
      
      mediaRecorder.onstart = () => {
        recordingIndicator.classList.remove('hidden');
        timeLeft = 180;
        startTimer();
      };

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        clearInterval(timerInterval);
        recordingIndicator.classList.add('hidden');
        timerDisplay.textContent = '03:00';
        progressLine.style.width = '100%';
        
        const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
        // Reset audio chunks for the next recording
        audioChunks = [];
        await processAudio(audioBlob);
        
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
        // Remove the red stop recording class
        toggleRecord.classList.remove('stop-recording');
      };

      mediaRecorder.start();
      isRecording = true;
      toggleRecord.textContent = 'Stop Recording';
      // Add the red color style for stop recording
      toggleRecord.classList.add('stop-recording');
    } catch (error) {
      displayError(`Unable to start recording: ${error.message}. Please ensure your microphone is enabled and accessible.`);
    }
  } else {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      isRecording = false;
      toggleRecord.textContent = 'Start Recording';
      // Remove the stop recording styling when not recording
      toggleRecord.classList.remove('stop-recording');
    }
  }
});

// File upload handler
audioUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    await processAudio(file);
  }
});

// Process audio using AssemblyAI API
async function processAudio(audioBlob) {
  resultsDiv.innerHTML = '';
  showProcessingSpinner();
  
  try {
    // Upload audio file
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: { 'authorization': API_KEY },
      body: audioBlob
    });
    const uploadData = await uploadResponse.json();
    const audioUrl = uploadData.upload_url;

    // Request transcript with speaker labels and summarization
    const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { 
        'authorization': API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        summarization: true,
        summary_model: 'conversational',
        summary_type: 'bullets'
      })
    });
    const transcriptData = await transcriptResponse.json();
    const transcriptId = transcriptData.id;

    // Poll for transcript completion
    let transcriptResult;
    while (true) {
      const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'authorization': API_KEY }
      });
      transcriptResult = await pollingResponse.json();
      if (transcriptResult.status === 'completed') break;
      if (transcriptResult.status === 'error') {
        throw new Error(transcriptResult.error || 'Transcription failed. Please try again with a clearer audio sample.');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    hideProcessingSpinner();
    generateFeedback(transcriptResult);
  } catch (error) {
    hideProcessingSpinner();
    displayError(`Error processing audio: ${error.message}`);
  }
}

// Display error message in results
function displayError(message) {
  resultsDiv.innerHTML = `<div class="error-message" role="alert">${message}</div>`;
}

// Generate conversation feedback from transcript data
function generateFeedback(transcript) {
  let resultsHTML = '';

  // Conversation summary if available
  if (transcript.summary) {
    resultsHTML += `<div class="feedback-section">
      <h2>Conversation Summary</h2>
      <p>${transcript.summary}</p>
    </div>`;
  }

  // Aggregate utterances by speaker
  const speakers = {};
  transcript.utterances.forEach(utterance => {
    const speakerId = utterance.speaker;
    if (!speakers[speakerId]) {
      speakers[speakerId] = { text: '', fillerCount: 0, utterances: [] };
    }
    speakers[speakerId].utterances.push(utterance.text);
    speakers[speakerId].text += ' ' + utterance.text;
    // Count filler words (expand list as needed)
    const fillers = (utterance.text.match(/\b(um|uh|like|you know)\b/gi) || []).length;
    speakers[speakerId].fillerCount += fillers;
  });

  // Tone analysis using keywords
  function analyzeTone(text) {
    const positiveKeywords = ['good', 'great', 'happy', 'excited', 'fantastic', 'awesome'];
    const negativeKeywords = ['bad', 'sad', 'angry', 'upset', 'terrible', 'frustrated'];
    let score = 0;
    positiveKeywords.forEach(word => {
      if (text.toLowerCase().includes(word)) score++;
    });
    negativeKeywords.forEach(word => {
      if (text.toLowerCase().includes(word)) score--;
    });
    if (score > 0) return 'Positive';
    if (score < 0) return 'Negative';
    return 'Neutral';
  }

  // Enhanced emotion analysis with expanded keywords
  function analyzeEmotion(text) {
    const emotions = {
      Joy: ['happy', 'joy', 'delighted', 'excited', 'enthusiastic'],
      Sadness: ['sad', 'down', 'gloomy', 'depressed'],
      Anger: ['angry', 'mad', 'furious', 'irate'],
      Fear: ['scared', 'afraid', 'terrified', 'anxious']
    };
    for (const [emotion, keywords] of Object.entries(emotions)) {
      for (const word of keywords) {
        if (text.toLowerCase().includes(word)) {
          return emotion;
        }
      }
    }
    return 'Neutral';
  }

  // Individual speaker analysis and feedback
  resultsHTML += `<div class="feedback-section">
    <h2>Participant Analysis</h2>`;
  for (const speaker in speakers) {
    const speakerData = speakers[speaker];
    const tone = analyzeTone(speakerData.text);
    const emotion = analyzeEmotion(speakerData.text);

    let individualFeedback = '';
    const avgFillers = speakerData.fillerCount / speakerData.utterances.length;
    if (avgFillers > 2) {
      individualFeedback += 'Consider reducing filler words for clearer communication. ';
    } else {
      individualFeedback += 'Good control over filler words. ';
    }
    if (tone === 'Negative') {
      individualFeedback += 'Adopt a more positive tone. ';
    } else if (tone === 'Positive') {
      individualFeedback += 'Your tone is engaging and upbeat. ';
    } else {
      individualFeedback += 'Your tone is fairly neutral. ';
    }
    if (emotion === 'Neutral') {
      individualFeedback += 'Try to express more emotion to better connect with your audience.';
    } else {
      individualFeedback += `Your dominant emotion is ${emotion}.`;
    }

    resultsHTML += `<div class="speaker-analysis">
      <h3>Speaker ${speaker}</h3>
      <div class="analysis-item"><strong>Filler Words Count:</strong> ${speakerData.fillerCount}</div>
      <div class="analysis-item"><strong>Tone:</strong> ${tone}</div>
      <div class="analysis-item"><strong>Primary Emotion:</strong> ${emotion}</div>
      <div class="analysis-item"><strong>Utterance Count:</strong> ${speakerData.utterances.length}</div>
      <div class="individual-feedback"><strong>Feedback:</strong> ${individualFeedback}</div>
    </div>`;
  }
  resultsHTML += `</div>`;

  // Overall conversation feedback
  let totalFillers = 0;
  let totalUtterances = 0;
  const tones = [];
  for (const speaker in speakers) {
    totalFillers += speakers[speaker].fillerCount;
    totalUtterances += speakers[speaker].utterances.length;
    tones.push(analyzeTone(speakers[speaker].text));
  }
  let overallFeedback = '';
  if (totalUtterances > 0 && (totalFillers / totalUtterances) > 2) {
    overallFeedback += 'High usage of filler words overall—practice concise communication. ';
  } else {
    overallFeedback += 'The conversation was generally clear with minimal filler words. ';
  }
  if (tones.includes('Negative')) {
    overallFeedback += 'Overall, the tone leans towards negative sentiment. ';
  } else if (tones.includes('Positive')) {
    overallFeedback += 'Overall, the conversation had an engaging and positive tone. ';
  } else {
    overallFeedback += 'The overall tone is neutral. ';
  }

  resultsHTML += `<div class="feedback-section">
    <h2>Overall Feedback</h2>
    <p>${overallFeedback}</p>
  </div>`;

  // Display the analysis
  resultsDiv.innerHTML = resultsHTML;
}
