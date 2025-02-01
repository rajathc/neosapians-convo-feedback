const toggleRecord = document.getElementById('toggleRecord');
const recordingIndicator = document.getElementById('recordingIndicator');
const audioUpload = document.getElementById('audioUpload');
const resultsDiv = document.getElementById('results');
const timerDisplay = document.getElementById('timer');
const progressLine = document.getElementById('progress-line');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let timeLeft = 180; // 3 minutes in seconds
let timerInterval = null;
let startTime = null;

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

// Toggle recording
toggleRecord.addEventListener('click', async () => {
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

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
        
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      toggleRecord.textContent = 'Stop Recording';
    } catch (error) {
      alert(`Error: ${error.message}. Allow microphone access!`);
      isRecording = false;
      toggleRecord.textContent = 'Start Recording';
      recordingIndicator.classList.add('hidden');
    }
  } else {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      isRecording = false;
      toggleRecord.textContent = 'Start Recording';
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

// Audio processing
async function processAudio(audioBlob) {
  resultsDiv.textContent = 'Processing...';

  try {
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: { 'authorization': '2785097c3f2e45c5b2f68afd73b045a5' },
      body: audioBlob
    });
    const uploadData = await uploadResponse.json();
    const audioUrl = uploadData.upload_url;

    const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { 
        'authorization': '2785097c3f2e45c5b2f68afd73b045a5',
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

    let transcriptResult;
    while (true) {
      const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'authorization': '2785097c3f2e45c5b2f68afd73b045a5' }
      });
      transcriptResult = await pollingResponse.json();
      if (transcriptResult.status === 'completed') break;
      if (transcriptResult.status === 'error') throw new Error('Transcription failed');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    generateFeedback(transcriptResult);
  } catch (error) {
    resultsDiv.textContent = `Error: ${error.message}`;
  }
}

// Generate feedback
function generateFeedback(transcript) {
  const speakers = {};

  transcript.utterances.forEach(utterance => {
    const speaker = utterance.speaker;
    if (!speakers[speaker]) speakers[speaker] = 0;
    speakers[speaker] += (utterance.text.match(/ um | uh | like /gi) || []).length;
  });

  let feedback = '';
  for (const speaker in speakers) {
    feedback += `Speaker ${speaker} used ${speakers[speaker]} filler words.\n`;
  }

  if (transcript.summary) {
    feedback += `\nConversation Summary:\n${transcript.summary}`;
  }

  resultsDiv.textContent = feedback;
}