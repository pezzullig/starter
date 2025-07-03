/// <reference types="https://deno.land/x/deno@v1.40.4/lib/deno.ns.d.ts" />

// Video-Audio Synchronization Script with Cloudinary
// Uploads audio files and generates on-the-fly transformation URLs for dynamic video-audio combination
// Run with: deno run --allow-net --allow-read --allow-write --allow-env scripts/video-audio-sync.ts

// @ts-ignore
declare const Deno: any;

import { loadEnvConfig, type Config } from './env-loader.ts';

interface VideoAnalysisResult {
  cloudinaryUrl: string;
  publicId: string;
  localFile: string;
  analysis: {
    description: string;
    shortFilename: string;
  };
  timestamp: string;
}

interface AudioFile {
  statementId: number;
  speed: number;
  filename: string;
  duration: number;
  wordCount: number;
  transcript: string;
  answer: boolean;
  translation: string;
  creatomateUrl?: string; // CreatorMate combined video URL
}

interface StatementAudioResult {
  cloudinaryUrl: string;
  publicId: string;
  audioFiles: AudioFile[];
  timestamp: string;
}

interface VideoAudioSyncConfig {
  targetSpeed?: number; // If specified, only process this speed
  targetVideoId?: string; // If specified, only process this video
  overwriteCloudinary: boolean; // Whether to overwrite existing files in Cloudinary
  fadeDuration: number; // Fade duration in seconds
  audioStartDelay: number; // Delay before audio starts playing (seconds)
  createCombinedVideos: boolean; // If true, create combined video-audio files and upload to Cloudinary
  uploadCombinedVideos: boolean; // If true, upload combined videos to Cloudinary
  startingVolume: number; // Volume level for video audio at start and end (0.0-1.0)
  decreasedVolume: number; // Volume level for video audio during Spanish audio (0.0-1.0)
  useCreatorMate: boolean; // If true, use CreatorMate APIs instead of ffmpeg
  onlyMissingCreatorMateUrls: boolean; // If true, only process speeds missing CreatorMate URLs
}

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface CloudinaryResource {
  public_id: string;
  secure_url: string;
  resource_type: string;
  format: string;
  duration?: number;
  width?: number;
  height?: number;
}

// Global config variable
let config: Config;

// Configuration for this run
const SYNC_CONFIG: VideoAudioSyncConfig & { maxVideos?: number } = {
  targetSpeed: undefined, // Process all speeds
  targetVideoId: undefined, // Process all videos
  overwriteCloudinary: true, // Set to true to overwrite existing files
  fadeDuration: 0.3, // 300ms fade duration
  audioStartDelay: 1.0, // Audio starts 1 second after video
  maxVideos: undefined, // Process all videos
  createCombinedVideos: true, // Create combined videos
  uploadCombinedVideos: false, // Don't upload to Cloudinary initially
  startingVolume: 0.6, // Volume level for video audio at start and end (60%)
  decreasedVolume: 0.2, // Volume level for video audio during Spanish audio (20%)
  useCreatorMate: true, // Use CreatorMate APIs instead of ffmpeg
  onlyMissingCreatorMateUrls: true // Only process speeds missing CreatorMate URLs
};

// Global file locks to prevent race conditions
const fileLocks = new Map<string, Promise<void>>();

// Acquire a lock for a specific file
async function acquireFileLock(filePath: string): Promise<() => void> {
  const existingLock = fileLocks.get(filePath);
  if (existingLock) {
    await existingLock;
  }
  
  let resolveLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  
  fileLocks.set(filePath, lockPromise);
  
  return () => {
    resolveLock!();
    fileLocks.delete(filePath);
  };
}

// Custom SHA-1 function using Web Crypto API
async function sha1(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Load video analysis collection
async function loadVideoAnalysis(): Promise<VideoAnalysisResult[]> {
  try {
    console.log(`📖 Loading CSV-generated video collection...`);
    
    const csvJsonPath = './json/video-analysis-collection-from-csv.json';
    const content = await Deno.readTextFile(csvJsonPath);
    const collection = JSON.parse(content);
    
    console.log(`📄 Found ${collection.videos.length} videos in CSV collection`);
    
    const videos: VideoAnalysisResult[] = [];
    
    for (const csvVideo of collection.videos) {
      try {
        const video: VideoAnalysisResult = {
          cloudinaryUrl: csvVideo.cloudinaryUrl,
          publicId: csvVideo.publicId,
          localFile: `./media/${csvVideo.publicId}.mp4`, // Construct local file path
          analysis: {
            description: csvVideo.analysis.description,
            shortFilename: csvVideo.analysis.shortFilename
          },
          timestamp: csvVideo.timestamp
        };
        
        // Only check for the corresponding spanish-s-<shortFilename>.json file
        const shortFilename = video.analysis.shortFilename;
        if (!shortFilename) {
          console.warn(`⚠️  Video ${video.publicId} is missing shortFilename. Skipping.`);
          continue;
        }
        const spanishAudioFile = `./json/spanish-s-${shortFilename}.json`;
        try {
          await Deno.stat(spanishAudioFile);
          
          // If onlyMissingCreatorMateUrls is true, check if this video has any missing CreatorMate URLs
          if (SYNC_CONFIG.onlyMissingCreatorMateUrls) {
            const audioContent = await Deno.readTextFile(spanishAudioFile);
            const audioData: StatementAudioResult = JSON.parse(audioContent);
            const missingCreatorMateUrls = audioData.audioFiles.filter(audioFile => !audioFile.creatomateUrl);
            
            if (missingCreatorMateUrls.length === 0) {
              console.log(`⏭️  Skipped: ${shortFilename} (all CreatorMate URLs present)`);
              continue;
            } else {
              console.log(`✅ Loaded: ${shortFilename} (${missingCreatorMateUrls.length} missing CreatorMate URLs)`);
            }
          }
          
          // Filter by target video ID if specified
          if (SYNC_CONFIG.targetVideoId) {
            if (shortFilename.includes(SYNC_CONFIG.targetVideoId) || video.publicId.includes(SYNC_CONFIG.targetVideoId)) {
              videos.push(video);
              console.log(`✅ Loaded: ${shortFilename} (target video: ${SYNC_CONFIG.targetVideoId})`);
            } else {
              console.log(`⏭️  Skipped: ${shortFilename} (not target video: ${SYNC_CONFIG.targetVideoId})`);
            }
          } else {
            videos.push(video);
            if (!SYNC_CONFIG.onlyMissingCreatorMateUrls) {
              console.log(`✅ Loaded: ${shortFilename} (has Spanish audio)`);
            }
          }
        } catch (error) {
          console.log(`⏭️  Skipped: ${shortFilename} (no Spanish audio file)`);
        }
        
      } catch (error) {
        console.error(`❌ Error loading video ${csvVideo.publicId}:`, error.message);
      }
    }
    
    console.log(`✅ Loaded ${videos.length} video analyses with Spanish audio files`);
    return videos;
    
  } catch (error) {
    console.error(`❌ Error loading video analysis:`, error.message);
    throw error;
  }
}

// Load audio files for a specific video
async function loadAudioFiles(videoShortFilename: string): Promise<AudioFile[]> {
  try {
    const audioFile = `./json/spanish-s-${videoShortFilename}.json`;
    const content = await Deno.readTextFile(audioFile);
    const audioData: StatementAudioResult = JSON.parse(content);
    
    let audioFiles = audioData.audioFiles;
    
    // Filter by target speed if specified
    if (SYNC_CONFIG.targetSpeed !== undefined) {
      audioFiles = audioFiles.filter(audio => audio.speed === SYNC_CONFIG.targetSpeed);
    }
    
    // If onlyMissingCreatorMateUrls is true, filter to only include speeds missing CreatorMate URLs
    if (SYNC_CONFIG.onlyMissingCreatorMateUrls) {
      const missingCreatorMateUrls = audioFiles.filter(audio => !audio.creatomateUrl);
      console.log(`   🎯 Found ${missingCreatorMateUrls.length} speeds missing CreatorMate URLs out of ${audioFiles.length} total speeds`);
      return missingCreatorMateUrls;
    }
    
    return audioFiles;
    
  } catch (error) {
    console.error(`❌ Error loading audio files for ${videoShortFilename}:`, error.message);
    return [];
  }
}

// Check if resource exists in Cloudinary
async function checkCloudinaryResource(publicId: string, resourceType: string = 'video'): Promise<boolean> {
  try {
    if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary credentials not set in config.env');
    }
    
    const auth = btoa(`${config.CLOUDINARY_API_KEY}:${config.CLOUDINARY_API_SECRET}`);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/resources/${resourceType}/${publicId}`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    return response.ok;
    
  } catch (error) {
    console.error(`❌ Error checking Cloudinary resource ${publicId}:`, error.message);
    return false;
  }
}

// Upload file to Cloudinary
async function uploadToCloudinary(filePath: string, publicId: string, resourceType: string = 'video'): Promise<CloudinaryUploadResult> {
  try {
    if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary credentials not set in config.env');
    }
    
    console.log(`☁️  Uploading ${filePath} to Cloudinary as ${publicId}...`);
    
    const fileData = await Deno.readFile(filePath);
    const formData = new FormData();
    formData.append('file', new Blob([fileData]), filePath.split('/').pop() || 'file');
    formData.append('public_id', publicId);
    // Signed upload params
    const timestamp = Math.floor(Date.now() / 1000).toString();
    formData.append('timestamp', timestamp);
    formData.append('api_key', config.CLOUDINARY_API_KEY);
    // Params for signature (sorted by key, joined as key=value&...)
    const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
    const signature = await sha1(paramsToSign + config.CLOUDINARY_API_SECRET);
    formData.append('signature', signature);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudinary upload failed: ${response.status} - ${errorText}`);
    }
    
    const result: CloudinaryUploadResult = await response.json();
    console.log(`✅ Uploaded to Cloudinary: ${result.public_id}`);
    return result;
    
  } catch (error) {
    console.error(`❌ Error uploading to Cloudinary:`, error.message);
    throw error;
  }
}

// Process a single video with its audio files
async function processVideoWithAudio(video: VideoAnalysisResult): Promise<void> {
  try {
    const shortFilename = video.analysis.shortFilename;
    if (!shortFilename) {
      console.warn(`⚠️  Video ${video.publicId} is missing shortFilename. Skipping.`);
      return;
    }
    console.log(`\n🎬 Processing video: ${shortFilename}`);
    
    // Load audio files for this video
    const audioFiles = await loadAudioFiles(shortFilename);
    
    if (audioFiles.length === 0) {
      console.log(`⚠️  No audio files found for ${shortFilename}, skipping...`);
      return;
    }
    
    console.log(`📁 Found ${audioFiles.length} audio file(s) to process`);
    
    if (SYNC_CONFIG.createCombinedVideos) {
      // Create combined videos mode
      console.log(`🎬 Creating combined videos for ${shortFilename}...`);
      
      if (SYNC_CONFIG.useCreatorMate) {
        // Process all speeds in parallel with CreatorMate
        await processAllSpeedsWithCreatorMate(video, audioFiles, shortFilename);
      } else {
        // Process speeds sequentially with ffmpeg
        for (const audioFile of audioFiles) {
          const speed = audioFile.speed;
          const audioFilename = audioFile.filename;
          
          console.log(`\n🎵 Processing combined video for speed ${speed}x: ${audioFilename}`);
          
          // Get accurate audio duration using ffmpeg
          const localAudioPath = `./audio/${audioFilename}`;
          let audioDuration: number;
          
          try {
            await Deno.stat(localAudioPath);
            audioDuration = await getAudioDuration(localAudioPath);
          } catch (error) {
            console.log(`⚠️  Local audio file not found: ${localAudioPath}`);
            continue;
          }
          
          // Define paths
          const videoPath = video.localFile;
          const combinedVideoFilename = `combined_${shortFilename}_speed${speed}.mp4`;
          const combinedVideoPath = `./combined/${combinedVideoFilename}`;
          
          // Create combined directory if it doesn't exist
          try {
            await Deno.mkdir('./combined', { recursive: true });
          } catch (error) {
            // Directory already exists
          }
          
          // Use ffmpeg (original method)
          console.log(`🔧 Using ffmpeg for video creation...`);
          await createCombinedVideo(videoPath, localAudioPath, combinedVideoPath, audioDuration);
          
          // Upload combined video to Cloudinary if enabled
          if (SYNC_CONFIG.uploadCombinedVideos) {
            const cloudinaryPublicId = `combined/${shortFilename}_speed${speed}`;
            const uploadResult = await uploadToCloudinary(combinedVideoPath, cloudinaryPublicId, 'video');
            
            // Update JSON with combined video URL and accurate duration
            await updateJsonWithCombinedVideo(shortFilename, audioFilename, audioDuration, uploadResult.secure_url);
            
            console.log(`✅ Combined video uploaded: ${uploadResult.secure_url}`);
          } else {
            // Just update JSON with local file path and accurate duration
            await updateJsonWithCombinedVideo(shortFilename, audioFilename, audioDuration, combinedVideoPath);
            
            console.log(`✅ Combined video created: ${combinedVideoPath}`);
          }
        }
      }
      
    } else {
      // Original audio-only mode
      console.log(`🎵 Processing audio files for ${shortFilename}...`);
      
      for (const audioFile of audioFiles) {
        const speed = audioFile.speed;
        const audioFilename = audioFile.filename;
        let audioDuration = audioFile.duration;
        
        console.log(`\n🎵 Processing audio: ${audioFilename} (${audioDuration.toFixed(1)}s)`);
        
        // Define Cloudinary public IDs
        const audioPublicId = `audio/${audioFilename.replace('.mp3', '')}`;
        
        // Check if audio exists in Cloudinary
        const audioExists = await checkCloudinaryResource(audioPublicId, 'video');
        
        if (!audioExists || SYNC_CONFIG.overwriteCloudinary) {
          // Upload audio file to Cloudinary
          const localAudioPath = `./audio/${audioFilename}`;
          
          try {
            await Deno.stat(localAudioPath);
          } catch (error) {
            console.log(`⚠️  Local audio file not found: ${localAudioPath}`);
            continue;
          }
          
          const uploadResult = await uploadToCloudinary(localAudioPath, audioPublicId, 'video');
          
          // Get accurate duration from Cloudinary and update JSON
          if (uploadResult.duration) {
            await updateJsonWithCloudinaryDuration(shortFilename, audioFilename, uploadResult.duration);
            // Use the Cloudinary duration for the transformation URL
            audioDuration = uploadResult.duration;
          }
        } else {
          console.log(`✅ Audio already exists in Cloudinary: ${audioPublicId}`);
          
          // Get duration from existing Cloudinary resource
          const resourceDetails = await getCloudinaryResourceDetails(audioPublicId, 'video');
          if (resourceDetails?.duration) {
            await updateJsonWithCloudinaryDuration(shortFilename, audioFilename, resourceDetails.duration);
            // Use the Cloudinary duration for the transformation URL
            audioDuration = resourceDetails.duration;
          }
        }
        
        // Generate the transformation URL for on-the-fly combination
        const audioStartTime = SYNC_CONFIG.audioStartDelay;
        const totalVideoDuration = audioStartTime + audioDuration + 2.0;
        const audioOverlayId = audioPublicId.replace(/\//g, ':');
        
        const transformations = [
          `du_${totalVideoDuration.toFixed(1)}`,
          `l_audio:${audioOverlayId},so_0.0,du_${audioDuration.toFixed(1)}/fl_layer_apply,so_${audioStartTime.toFixed(1)}`
        ].join('/');
        
        const onTheFlyUrl = `https://res.cloudinary.com/${config.CLOUDINARY_CLOUD_NAME}/video/upload/${transformations}/${video.publicId}`;
        
        console.log(`🔗 On-the-fly URL for speed ${speed}: ${onTheFlyUrl}`);
        
        // Store the transformation URL in the JSON file
        await updateJsonWithCloudinaryDuration(shortFilename, audioFilename, audioDuration, onTheFlyUrl);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error processing video ${video.publicId}:`, error.message);
  }
}

// Test Cloudinary credentials
async function testCloudinaryCredentials(): Promise<boolean> {
  try {
    console.log(`🔍 Testing Cloudinary credentials...`);
    console.log(`   Cloud Name: ${config.CLOUDINARY_CLOUD_NAME}`);
    console.log(`   API Key: ${config.CLOUDINARY_API_KEY?.substring(0, 10)}...`);
    console.log(`   API Secret: ${config.CLOUDINARY_API_SECRET?.substring(0, 10)}...`);
    
    if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
      throw new Error('Missing Cloudinary credentials');
    }
    
    const auth = btoa(`${config.CLOUDINARY_API_KEY}:${config.CLOUDINARY_API_SECRET}`);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/resources/video`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    if (response.ok) {
      console.log(`✅ Cloudinary credentials are valid`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ Cloudinary credentials test failed: ${response.status} - ${errorText}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Error testing Cloudinary credentials:`, error.message);
    return false;
  }
}

// Get resource details from Cloudinary
async function getCloudinaryResourceDetails(publicId: string, resourceType: string = 'video'): Promise<CloudinaryResource | null> {
  try {
    if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary credentials not set in config.env');
    }
    
    const auth = btoa(`${config.CLOUDINARY_API_KEY}:${config.CLOUDINARY_API_SECRET}`);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/resources/${resourceType}/${publicId}`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error fetching resource details: ${response.status} - ${errorText}`);
      return null;
    }
    
    const result: CloudinaryResource = await response.json();
    return result;
    
  } catch (error) {
    console.error(`❌ Error getting Cloudinary resource details:`, error.message);
    return null;
  }
}

// Update JSON file with accurate duration from Cloudinary
async function updateJsonWithCloudinaryDuration(
  videoShortFilename: string, 
  audioFilename: string, 
  cloudinaryDuration: number,
  transformationUrl?: string
): Promise<void> {
  try {
    const jsonFilePath = `./json/spanish-s-${videoShortFilename}.json`;
    const content = await Deno.readTextFile(jsonFilePath);
    const audioData: StatementAudioResult = JSON.parse(content);
    
    // Find and update the specific audio file
    const audioFile = audioData.audioFiles.find(audio => audio.filename === audioFilename);
    if (audioFile) {
      const oldDuration = audioFile.duration;
      audioFile.duration = cloudinaryDuration;
      console.log(`📝 Updated duration for ${audioFilename}: ${oldDuration.toFixed(3)}s → ${cloudinaryDuration.toFixed(3)}s`);
      
      // Add transformation URL if provided
      if (transformationUrl) {
        (audioFile as any).transformationUrl = transformationUrl;
        console.log(`🔗 Stored transformation URL for ${audioFilename}`);
      }
      
      // Write back to JSON file
      await Deno.writeTextFile(jsonFilePath, JSON.stringify(audioData, null, 2));
      console.log(`💾 Updated JSON file: ${jsonFilePath}`);
    } else {
      console.log(`⚠️  Audio file ${audioFilename} not found in JSON data`);
    }
    
  } catch (error) {
    console.error(`❌ Error updating JSON with Cloudinary duration:`, error.message);
  }
}

// Update JSON file with combined video URL and accurate duration
async function updateJsonWithCombinedVideo(
  videoShortFilename: string, 
  audioFilename: string, 
  audioDuration: number,
  combinedVideoUrl: string
): Promise<void> {
  const jsonFilePath = `./json/spanish-s-${videoShortFilename}.json`;
  const releaseLock = await acquireFileLock(jsonFilePath);
  
  try {
    console.log(`🔒 Acquired lock for ${jsonFilePath}`);
    
    const content = await Deno.readTextFile(jsonFilePath);
    const audioData: StatementAudioResult = JSON.parse(content);
    
    // Find and update the specific audio file
    const audioFile = audioData.audioFiles.find(audio => audio.filename === audioFilename);
    if (audioFile) {
      const oldDuration = audioFile.duration;
      audioFile.duration = audioDuration;
      console.log(`📝 Updated duration for ${audioFilename}: ${oldDuration.toFixed(3)}s → ${audioDuration.toFixed(3)}s`);
      
      // Add CreatorMate combined video URL
      audioFile.creatomateUrl = combinedVideoUrl;
      console.log(`🔗 Stored CreatorMate URL for ${audioFilename}`);
      
      // Update timestamp before saving
      audioData.timestamp = new Date().toISOString();
      
      // Write back to JSON file
      await Deno.writeTextFile(jsonFilePath, JSON.stringify(audioData, null, 2));
      console.log(`💾 Updated JSON file: ${jsonFilePath}`);
      console.log(`🕒 Updated timestamp: ${audioData.timestamp}`);
    } else {
      console.log(`⚠️  Audio file ${audioFilename} not found in JSON data`);
    }
    
  } catch (error) {
    console.error(`❌ Error updating JSON with combined video:`, error.message);
    throw error;
  } finally {
    releaseLock();
    console.log(`🔓 Released lock for ${jsonFilePath}`);
  }
}

// Get audio duration using afinfo (macOS built-in)
async function getAudioDuration(audioFilePath: string): Promise<number> {
  try {
    console.log(`🔍 Getting audio duration for ${audioFilePath}...`);
    
    const process = Deno.run({
      cmd: ['afinfo', audioFilePath],
      stdout: 'piped',
      stderr: 'piped'
    });
    
    const status = await process.status();
    
    if (!status.success) {
      const errorOutput = new TextDecoder().decode(await process.stderrOutput());
      throw new Error(`afinfo failed: ${errorOutput}`);
    }
    
    const output = new TextDecoder().decode(await process.output());
    
    // Parse the estimated duration line
    const durationMatch = output.match(/estimated duration:\s*([\d.]+)\s*sec/);
    if (!durationMatch) {
      throw new Error(`Could not find duration in afinfo output: ${output}`);
    }
    
    const duration = parseFloat(durationMatch[1]);
    
    if (isNaN(duration) || duration <= 0) {
      throw new Error(`Invalid duration: ${durationMatch[1]}`);
    }
    
    console.log(`✅ Audio duration: ${duration.toFixed(3)}s`);
    return duration;
    
  } catch (error) {
    console.error(`❌ Error getting audio duration:`, error.message);
    throw error;
  }
}

// Create combined video with audio using ffmpeg
async function createCombinedVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  audioDuration: number
): Promise<void> {
  try {
    console.log(`🎬 Creating combined video: ${outputPath}`);
    console.log(`   Video: ${videoPath}`);
    console.log(`   Audio: ${audioPath} (${audioDuration.toFixed(3)}s)`);
    
    // Calculate timing parameters
    const audioStartTime = SYNC_CONFIG.audioStartDelay;
    const videoEndTime = audioStartTime + audioDuration + 2.0; // 2 seconds after audio ends
    
    // Build ffmpeg command with volume transitions
    const ffmpegCmd = [
      'ffmpeg',
      '-i', videoPath,
      '-i', audioPath,
      '-filter_complex', [
        // Video filter: trim to desired length and apply volume transitions
        `[0:v]trim=duration=${videoEndTime},fps=30[video]`,
        // Audio filter: normalize first, then apply volume transitions
        `[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,volume='if(between(t,0,${audioStartTime}),${SYNC_CONFIG.startingVolume},if(between(t,${audioStartTime},${audioStartTime + audioDuration}),${SYNC_CONFIG.decreasedVolume},${SYNC_CONFIG.startingVolume}))'[video_audio]`,
        // Audio overlay: delay the audio by audioStartTime
        `[1:a]adelay=${Math.round(audioStartTime * 1000)}|${Math.round(audioStartTime * 1000)}[delayed_audio]`,
        // Mix video audio and delayed audio
        `[video_audio][delayed_audio]amix=inputs=2:duration=longest[mixed_audio]`
      ].join(';'),
      '-map', '[video]',
      '-map', '[mixed_audio]',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-y', // Overwrite output file
      outputPath
    ];
    
    console.log(`🔧 FFmpeg command: ${ffmpegCmd.join(' ')}`);
    
    const process = Deno.run({
      cmd: ffmpegCmd,
      stdout: 'piped',
      stderr: 'piped'
    });
    
    const status = await process.status();
    
    if (!status.success) {
      const errorOutput = new TextDecoder().decode(await process.stderrOutput());
      throw new Error(`FFmpeg failed: ${errorOutput}`);
    }
    
    console.log(`✅ Combined video created: ${outputPath}`);
    
  } catch (error) {
    console.error(`❌ Error creating combined video:`, error.message);
    throw error;
  }
}

// CreatorMate API functions
interface CreatorMateConfig {
  apiKey?: string;
  apiUrl?: string;
}

interface CreatorMateRenderRequest {
  output_format?: string;
  frame_rate?: number;
  render_scale?: number;
  max_width?: number;
  max_height?: number;
  template_id?: string;
  tags?: string[];
  source?: object;
  modifications?: object;
  webhook_url?: string;
  metadata?: string;
}

interface CreatorMateRender {
  id: string;
  status: string;
  url: string;
  template_id?: string;
  template_name?: string;
  template_tags?: string[];
  output_format: string;
  modifications?: object;
}

// Process all speeds in parallel with CreatorMate
async function processAllSpeedsWithCreatorMate(
  video: VideoAnalysisResult, 
  audioFiles: AudioFile[], 
  shortFilename: string
): Promise<void> {
  // Filter audio files based on configuration
  let audioFilesToProcess = audioFiles;
  let missingCreatorMateUrls: AudioFile[] = [];
  let existingCreatorMateUrls: AudioFile[] = [];
  
  if (SYNC_CONFIG.onlyMissingCreatorMateUrls) {
    // Only process speeds missing CreatorMate URLs
    missingCreatorMateUrls = audioFiles.filter(audioFile => !audioFile.creatomateUrl);
    existingCreatorMateUrls = audioFiles.filter(audioFile => audioFile.creatomateUrl);
    audioFilesToProcess = missingCreatorMateUrls;
    
    console.log(`🤖 Processing ${missingCreatorMateUrls.length} missing speeds (${existingCreatorMateUrls.length} already have CreatorMate URLs)...`);
    
    if (missingCreatorMateUrls.length === 0) {
      console.log(`✅ All speeds already have CreatorMate URLs, skipping...`);
      return;
    }
  } else {
    // Process all speeds
    console.log(`🤖 Processing all ${audioFiles.length} speeds in parallel with CreatorMate...`);
  }
  
  // Prepare all audio files and get durations
  const audioTasks = audioFilesToProcess.map(async (audioFile) => {
    const speed = audioFile.speed;
    const audioFilename = audioFile.filename;
    const localAudioPath = `./audio/${audioFilename}`;
    
    try {
      await Deno.stat(localAudioPath);
      const audioDuration = await getAudioDuration(localAudioPath);
      
      // Upload audio to Cloudinary if needed
      const audioPublicId = `audio/${audioFilename.replace('.mp3', '')}`;
      let audioCloudinaryUrl = '';
      
      const audioExists = await checkCloudinaryResource(audioPublicId, 'video');
      if (!audioExists || SYNC_CONFIG.overwriteCloudinary) {
        const uploadResult = await uploadToCloudinary(localAudioPath, audioPublicId, 'video');
        audioCloudinaryUrl = uploadResult.secure_url;
      } else {
        const resourceDetails = await getCloudinaryResourceDetails(audioPublicId, 'video');
        audioCloudinaryUrl = resourceDetails?.secure_url || '';
      }
      
      if (!audioCloudinaryUrl) {
        throw new Error(`Could not get Cloudinary URL for audio: ${audioFilename}`);
      }
      
      return {
        audioFile,
        speed,
        audioFilename,
        audioDuration,
        audioCloudinaryUrl,
        combinedVideoFilename: `combined_${shortFilename}_speed${speed}.mp4`
      };
    } catch (error) {
      console.log(`⚠️  Error preparing audio ${audioFilename}: ${error.message}`);
      return null;
    }
  });
  
  const preparedAudios = (await Promise.all(audioTasks)).filter(audio => audio !== null);
  
  if (preparedAudios.length === 0) {
    console.log(`❌ No audio files could be prepared, skipping...`);
    return;
  }
  
  console.log(`📤 Sending ${preparedAudios.length} CreatorMate render requests in parallel...`);
  
  // Send all CreatorMate requests in parallel
  const renderTasks = preparedAudios.map(async (audio) => {
    if (!audio) return null;
    
    const { audioFile, speed, audioFilename, audioDuration, audioCloudinaryUrl, combinedVideoFilename } = audio;
    
    console.log(`   🎵 Speed ${speed}x: ${audioFilename} (${audioDuration.toFixed(3)}s)`);
    
    try {
      // Use direct Cloudinary video URL for CreatorMate
      const directVideoUrl = `https://res.cloudinary.com/${config.CLOUDINARY_CLOUD_NAME}/video/upload/${video.publicId}.mp4`;
      
      // Create CreatorMate render request
      const renderId = await createCreatorMateRenderRequest(
        directVideoUrl,
        audioCloudinaryUrl,
        audioDuration,
        combinedVideoFilename
      );
      
      return {
        audioFile,
        speed,
        audioFilename,
        audioDuration,
        renderId,
        combinedVideoFilename
      };
    } catch (error) {
      console.log(`❌ Failed to create render for speed ${speed}x: ${error.message}`);
      return null;
    }
  });
  
  const renderResults = (await Promise.all(renderTasks)).filter(result => result !== null);
  
  if (renderResults.length === 0) {
    console.log(`❌ No renders were created, skipping...`);
    return;
  }
  
  console.log(`✅ Created ${renderResults.length} render requests`);
  console.log(`⏳ Polling all renders for completion...`);
  
  // Poll all renders in parallel
  const pollTasks = renderResults.map(async (result) => {
    if (!result) return null;
    
    const { audioFile, speed, audioFilename, audioDuration, renderId, combinedVideoFilename } = result;
    
    try {
      const finalUrl = await pollRenderCompletion(renderId);
      
      // Update JSON with CreatorMate URL
      await updateJsonWithCombinedVideo(shortFilename, audioFilename, audioDuration, finalUrl);
      
      console.log(`✅ Speed ${speed}x completed: ${finalUrl}`);
      
      return {
        audioFile,
        speed,
        audioFilename,
        audioDuration,
        finalUrl,
        combinedVideoFilename
      };
    } catch (error) {
      console.log(`❌ Render failed for speed ${speed}x: ${error.message}`);
      return null;
    }
  });
  
  const completedRenders = (await Promise.all(pollTasks)).filter(result => result !== null);
  
  console.log(`\n📊 Parallel processing summary:`);
  console.log(`   Total audio files: ${audioFiles.length}`);
  if (SYNC_CONFIG.onlyMissingCreatorMateUrls) {
    console.log(`   Missing CreatorMate URLs: ${missingCreatorMateUrls.length}`);
    console.log(`   Already have CreatorMate URLs: ${existingCreatorMateUrls.length}`);
  }
  console.log(`   Successfully prepared: ${preparedAudios.length}`);
  console.log(`   Render requests created: ${renderResults.length}`);
  console.log(`   Successfully completed: ${completedRenders.length}`);
  
  if (completedRenders.length > 0) {
    console.log(`\n✅ Successfully created ${completedRenders.length} combined videos:`);
    completedRenders.forEach(result => {
      if (result) {
        console.log(`   ${result.speed}x: ${result.finalUrl}`);
      }
    });
  }
}

// Create CreatorMate render request and return render ID
async function createCreatorMateRenderRequest(
  videoUrl: string,
  audioUrl: string,
  audioDuration: number,
  outputFilename: string
): Promise<string> {
  if (!config.CREATORMATE_API_KEY) {
    throw new Error('CreatorMate API key not set in config.env');
  }
  
  // Use TikTok dimensions (vertical format)
  const videoWidth = 1080;
  const videoHeight = 1920;
  
  // Calculate timing based on audio duration
  const startDelay = SYNC_CONFIG.audioStartDelay; // 1 second delay before audio starts
  const audioEndTime = startDelay + audioDuration; // When audio ends
  const videoEndTime = audioEndTime + 2; // Video ends 2 seconds after audio ends
  const totalDuration = videoEndTime; // Total video duration = audio duration + 3 seconds
  
  console.log(`📊 Timing calculation for ${outputFilename}:`);
  console.log(`   Audio duration: ${audioDuration.toFixed(2)}s`);
  console.log(`   Start delay: ${startDelay}s`);
  console.log(`   Audio ends at: ${audioEndTime.toFixed(2)}s`);
  console.log(`   Video ends at: ${videoEndTime.toFixed(2)}s`);
  console.log(`   Total duration: ${totalDuration.toFixed(2)}s`);

  // Create source template for video-audio combination
  const source = {
    output_format: "mp4",
    width: videoWidth,
    height: videoHeight,
    duration: `${totalDuration} s`, // Set total duration
    elements: [
      // First segment: full volume (0s to startDelay)
      {
        type: "video",
        source: videoUrl,
        track: 1,
        time: `0 s`,
        duration: `${startDelay} s`,
        volume: "60%",
        audio_fade_out: `${SYNC_CONFIG.fadeDuration} s`
      },
      // Second segment: reduced volume during audio (startDelay to audioEndTime)
      {
        type: "video",
        source: videoUrl,
        track: 1,
        time: `${startDelay} s`,
        trim_start: `${startDelay} s`,
        duration: `${audioDuration} s`,
        volume: "20%",
        audio_fade_in: `${SYNC_CONFIG.fadeDuration} s`,
        audio_fade_out: `${SYNC_CONFIG.fadeDuration} s`
      },
      // Third segment: full volume after audio (with overlap for smooth transition)
      {
        type: "video",
        source: videoUrl,
        track: 1,
        time: `${audioEndTime - SYNC_CONFIG.fadeDuration - 0.5} s`,
        trim_start: `${audioEndTime - SYNC_CONFIG.fadeDuration - 0.5} s`,
        duration: `${2 + SYNC_CONFIG.fadeDuration + 0.5} s`, // 2 seconds after audio ends + overlap
        volume: "60%",
        audio_fade_in: `${SYNC_CONFIG.fadeDuration} s`
      },
      // Spanish audio overlay
      {
        type: "audio",
        source: audioUrl,
        track: 2,
        time: `${startDelay} s`,
        duration: `${audioDuration} s`
      }
    ]
  };
  
  const request: CreatorMateRenderRequest = {
    output_format: "mp4",
    frame_rate: 30,
    source: source,
    metadata: `Combined video: ${outputFilename}`
  };
  
  const response = await fetch(`${config.CREATORMATE_API_URL || 'https://api.creatomate.com'}/v1/renders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.CREATORMATE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CreatorMate API failed: ${response.status} - ${errorText}`);
  }
  
  const result: CreatorMateRender[] = await response.json();
  
  if (!result || result.length === 0) {
    throw new Error('CreatorMate API returned no renders');
  }
  
  const render = result[0];
  return render.id;
}

// Poll for render completion
async function pollRenderCompletion(renderId: string, maxAttempts: number = 30): Promise<string> {
  try {
    console.log(`⏳ Polling for render completion: ${renderId}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`   Attempt ${attempt}/${maxAttempts}...`);
      
      const response = await fetch(`${config.CREATORMATE_API_URL || 'https://api.creatomate.com'}/v1/renders/${renderId}`, {
        headers: {
          'Authorization': `Bearer ${config.CREATORMATE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to check render status: ${response.status}`);
      }
      
      const render: CreatorMateRender = await response.json();
      
      if (render.status === 'completed' || render.status === 'succeeded') {
        console.log(`✅ Render ${render.status}: ${render.url}`);
        return render.url;
      } else if (render.status === 'failed') {
        throw new Error(`Render failed: ${render.id}`);
      } else if (render.status === 'processing' || render.status === 'planned') {
        console.log(`   Status: ${render.status}, waiting...`);
        // Wait 10 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        console.log(`   Unknown status: ${render.status}`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    throw new Error(`Render did not complete within ${maxAttempts} attempts`);
    
  } catch (error) {
    console.error(`❌ Error polling render completion:`, error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log('🎬 Video-Audio Synchronization Script');
    console.log('☁️  Using Cloudinary for video processing');
    console.log('');
    
    // Load configuration
    const loadedConfig = await loadEnvConfig();
    config = loadedConfig;
    
    // Check required API keys
    if (!config.CLOUDINARY_CLOUD_NAME) {
      throw new Error('CLOUDINARY_CLOUD_NAME not set in config.env');
    }
    if (!config.CLOUDINARY_API_KEY) {
      throw new Error('CLOUDINARY_API_KEY not set in config.env');
    }
    if (!config.CLOUDINARY_API_SECRET) {
      throw new Error('CLOUDINARY_API_SECRET not set in config.env');
    }
    
    console.log(`🔑 Cloudinary Cloud: ${config.CLOUDINARY_CLOUD_NAME}`);
    console.log(`🎯 Target Video: ${SYNC_CONFIG.targetVideoId || 'All videos'}`);
    console.log(`🎯 Target Speed: ${SYNC_CONFIG.targetSpeed || 'All speeds'}`);
    console.log(`🔄 Overwrite: ${SYNC_CONFIG.overwriteCloudinary ? 'Yes' : 'No'}`);
    console.log(`⏱️  Fade Duration: ${SYNC_CONFIG.fadeDuration}s`);
    console.log(`⏰ Audio Start Delay: ${SYNC_CONFIG.audioStartDelay}s`);
    console.log(`🔊 Starting Volume: ${(SYNC_CONFIG.startingVolume * 100).toFixed(0)}%`);
    console.log(`🔊 Decreased Volume: ${(SYNC_CONFIG.decreasedVolume * 100).toFixed(0)}%`);
    console.log(`🎬 Create Combined Videos: ${SYNC_CONFIG.createCombinedVideos ? 'Yes' : 'No'}`);
    console.log(`☁️  Upload Combined Videos: ${SYNC_CONFIG.uploadCombinedVideos ? 'Yes' : 'No'}`);
    console.log(`🤖 Use CreatorMate APIs: ${SYNC_CONFIG.useCreatorMate ? 'Yes' : 'No'}`);
    console.log(`🎯 Only Missing URLs: ${SYNC_CONFIG.onlyMissingCreatorMateUrls ? 'Yes' : 'No'}`);
    console.log('');
    
    // Display JSON configuration
    console.log('📋 JSON Configuration:');
    console.log(JSON.stringify(SYNC_CONFIG, null, 2));
    console.log('');
    
    // Test Cloudinary credentials first
    const credentialsValid = await testCloudinaryCredentials();
    if (!credentialsValid) {
      throw new Error('Cloudinary credentials are invalid. Please check your config.env file.');
    }
    
    // Load video analyses
    let videos = await loadVideoAnalysis();
    
    if (videos.length === 0) {
      console.log('📭 No video analyses found');
      return;
    }
    
    // Only process up to maxVideos if set (but not if maxVideos is -1 for all videos)
    if (SYNC_CONFIG.maxVideos !== undefined && SYNC_CONFIG.maxVideos !== -1) {
      videos = videos.slice(0, SYNC_CONFIG.maxVideos);
    }
    
    console.log(`🎯 Processing ${videos.length} video(s)`);
    
    let processedCount = 0;
    let skippedCount = 0;
    
    // Process each video
    for (const video of videos) {
      try {
        await processVideoWithAudio(video);
        processedCount++;
      } catch (error) {
        console.error(`❌ Failed to process ${video.publicId}:`, error.message);
        skippedCount++;
      }
    }
    
    // Summary
    console.log(`\n📊 Processing Summary:`);
    console.log(`   Total videos: ${videos.length}`);
    console.log(`   Processed: ${processedCount}`);
    console.log(`   Skipped/Failed: ${skippedCount}`);
    
    console.log('\n✅ Video-audio synchronization completed!');
    
  } catch (error) {
    console.error('💥 Main execution failed:', error.message);
  }
}

// Run if this is the main module
// @ts-ignore
if (import.meta.main) {
  main();
}