# Conversation Feedback Tool

A proof-of-concept web application that captures or accepts audio input of a conversation, transcribes it with speaker labels, and provides actionable feedback on communication performance. This tool leverages AssemblyAI for transcription and summarization and performs basic analysis on filler word usage, tone, and emotion.

## Features

- **Audio Input:** Record audio directly in the browser or upload an audio file.
- **Transcription:** Uses AssemblyAI to transcribe audio and generate speaker labels.
- **Conversation Analysis:** Aggregates speaker data to provide:
  - Conversation summary.
  - Individual speaker analysis (filler words, tone, emotion, and utterance count).
  - Overall feedback on conversation quality.
- **Responsive UI:** Includes visual feedback elements like a timer, progress bar, and spinner during audio processing.
- **Accessibility:** Designed with semantic HTML and ARIA attributes for improved accessibility.

## Technologies Used

- **Frontend:** HTML5, CSS3, and JavaScript (ES6+)
- **APIs:** AssemblyAI for transcription and summarization
- **Browser APIs:** MediaRecorder API for real-time audio capture