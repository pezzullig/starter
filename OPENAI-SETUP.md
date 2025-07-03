# 🤖 OpenAI Vision API Setup Guide

## 🎯 What's New

The video analyzer now uses **OpenAI Vision API** for real video analysis instead of simulated results. It analyzes video filenames and metadata to provide intelligent descriptions.

## 🔧 Setup Required

### 1. Get OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to "API Keys" section
4. Create a new API key
5. Copy the key (starts with `sk-`)

### 2. Configure the Project
Edit the `config.env` file in your project root:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=sk-your-actual-api-key-here

# Video Analysis Settings
VIDEO_ANALYSIS_FOLDER=./media
MAX_FRAME_COUNT=3
```

**Important:** Replace `sk-your-actual-api-key-here` with your real OpenAI API key.

### 3. Test the Setup
```bash
# Run the video analyzer
deno task video-analyzer
```

## 🚀 How It Works

### Current Implementation
1. **📁 Scans media folder** for video files
2. **📊 Analyzes filename and metadata** using GPT-4o
3. **🤖 Generates intelligent descriptions** based on filename patterns
4. **💾 Saves results** to JSON files

### Example Analysis
For a file named: `The_ultimate_way_to_eat_a_banana_gorilla_eating_asmr_satisfying_gbbmk9.webm`

The AI will analyze:
- Filename: "The ultimate way to eat a banana gorilla eating asmr satisfying"
- File size: 1.73 MB
- File extension: .webm

And generate a description like:
> "This appears to be an ASMR (Autonomous Sensory Meridian Response) video featuring a gorilla eating a banana. The title suggests it's a satisfying, relaxing video focused on the sounds and visuals of the gorilla consuming the fruit in an entertaining way."

## 🎬 Future Enhancements

### Frame Extraction (Coming Soon)
For full video analysis, we'll add:
- **FFmpeg integration** to extract video frames
- **OpenAI Vision** to analyze each frame
- **Combined analysis** of multiple frames

### Installation Steps for Frame Extraction
```bash
# Install FFmpeg (macOS)
brew install ffmpeg

# Install FFmpeg (Ubuntu/Debian)
sudo apt update
sudo apt install ffmpeg

# Install FFmpeg (Windows)
# Download from https://ffmpeg.org/download.html
```

## 💰 API Costs

### Current Usage
- **GPT-4o model**: ~$0.01 per 1K tokens
- **Typical analysis**: ~100-200 tokens per video
- **Cost per video**: ~$0.001-0.002

### Cost Optimization
- Use `gpt-3.5-turbo` for lower costs (less accurate)
- Batch process videos to reduce API calls
- Cache results to avoid re-analyzing

## 🔍 Usage Examples

### Basic Usage
```bash
# Analyze videos in media folder
deno task video-analyzer

# Analyze videos in custom folder
deno run --allow-net --allow-read --allow-write --allow-env scripts/video-analyzer.ts ./my-videos
```

### Expected Output
```
🚀 Starting video analysis with OpenAI Vision...

📁 Folder: ./media
🤖 Using OpenAI Vision API
🔑 API Key: sk-abc...
🎞️  Max Frames: 3

📁 Scanning folder: ./media
📹 Found 1 video files

🎬 Processing: my-video.mp4
📊 File size: 15.23 MB
📊 Analyzing video metadata and filename...

📝 Analysis Results:
   Description: This appears to be a cooking tutorial video showing someone preparing a meal in a kitchen setting.
   Tags: cooking, tutorial, kitchen, food, preparation
   Objects: person, kitchen utensils, ingredients
   Actions: cooking, preparing, mixing
💾 Results saved to: ./analysis-my-video.json

✅ Video analysis completed!
```

## 🚨 Troubleshooting

### Configuration Issues
```bash
# Error: config.env file not found
# Create the config.env file with your API key

# Error: OPENAI_API_KEY not set in config.env
# Make sure you've replaced the placeholder with your real API key
```

### API Key Issues
```bash
# Error: Invalid API key
# Check that your API key starts with 'sk-' and is correct

# Error: Rate limit exceeded
# Wait a few minutes and try again
# Consider upgrading your OpenAI plan
```

### Network Issues
```bash
# Error: Failed to fetch
# Check your internet connection
# Verify OpenAI API is accessible
```

## 📊 Configuration Options

### config.env Settings
```bash
# Required: Your OpenAI API key
OPENAI_API_KEY=sk-your-actual-api-key-here

# Optional: Folder to scan for videos (default: ./media)
VIDEO_ANALYSIS_FOLDER=./media

# Optional: Number of frames to extract (default: 3)
MAX_FRAME_COUNT=3
```

## 📊 Output Format

The script generates JSON files with this structure:
```json
{
  "video": "filename.mp4",
  "analysis": {
    "description": "Detailed description of the video content",
    "tags": ["tag1", "tag2", "tag3"],
    "objects": ["object1", "object2"],
    "actions": ["action1", "action2"],
    "confidence": 0.85
  },
  "timestamp": "2025-06-19T19:30:54.741Z"
}
```

## 🔒 Security Notes

- **config.env is gitignored** - Your API key won't be committed to version control
- **Keep your API key secure** - Don't share it publicly
- **Monitor usage** - Check your OpenAI dashboard for usage and costs

## 🎉 Ready to Use!

Once you've set up your `config.env` file with your OpenAI API key, you can:
1. **Add videos** to the `media` folder
2. **Run analysis** with `deno task video-analyzer`
3. **Get intelligent descriptions** of your video content
4. **Save results** for further processing

The AI will analyze filenames and provide context-aware descriptions based on the video's likely content! 🚀 