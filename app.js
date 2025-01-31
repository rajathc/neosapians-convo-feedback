const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const audioUpload = document.getElementById('audioUpload');
const resultsDiv = document.getElementById('results');

let mediaRecorder;
let audioChunks = [];

// 1. Start Recording
recordButton.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await processAudio(audioBlob);
      stream.getTracks().forEach(track => track.stop()); // Release microphone
    };

    mediaRecorder.start();
    recordButton.disabled = true;
    stopButton.disabled = false;
    audioChunks = [];
  } catch (error) {
    alert(`Error: ${error.message}. Allow microphone access!`);
  }
});

// 2. Stop Recording
stopButton.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    recordButton.disabled = false;
    stopButton.disabled = true;
  }
});

// 3. Handle File Upload
audioUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    await processAudio(file);
  }
});

// 4. Transcribe Audio & Generate Feedback
async function processAudio(audioBlob) {
  resultsDiv.textContent = 'Processing...';

  try {
    // Upload audio to AssemblyAI
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: { 'authorization': '2785097c3f2e45c5b2f68afd73b045a5' },
      body: audioBlob
    });
    const uploadData = await uploadResponse.json();
    const audioUrl = uploadData.upload_url;

    // Request transcription
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

    // Poll for results
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

    // Show feedback
    generateFeedback(transcriptResult);
  } catch (error) {
    resultsDiv.textContent = `Error: ${error.message}`;
  }
}

// 5. Generate Feedback
function generateFeedback(transcript) {
  const speakers = {};
  const totalDuration = transcript.audio_duration;

  // Calculate speaking time and filler words
  transcript.utterances.forEach(utterance => {
    const speaker = utterance.speaker;
    const duration = utterance.end - utterance.start;

    if (!speakers[speaker]) {
      speakers[speaker] = {
        text: [],
        totalDuration: 0,
        fillerWords: 0
      };
    }

    speakers[speaker].text.push(utterance.text);
    speakers[speaker].totalDuration += duration;
    speakers[speaker].fillerWords += (utterance.text.match(/ um | uh | like /gi) || []).length;
  });

  // Build feedback string
  let feedback = '';
  for (const speaker in speakers) {
    const percentage = ((speakers[speaker].totalDuration / totalDuration) * 100).toFixed(1);
    feedback += `Speaker ${speaker}:\n- Used ${speakers[speaker].fillerWords} filler words\n- Spoke ${percentage}% of the time\n\n`;
  }

  // Add summary
  if (transcript.summary) {
    feedback += `Conversation Summary:\n${transcript.summary}`;
  }

  resultsDiv.textContent = feedback;
}