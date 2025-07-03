/// <reference types="https://deno.land/x/deno@v1.40.4/lib/deno.ns.d.ts" />

// Video Data Formatter Script
// Reads from CSV-generated JSON and creates a simple array of video objects
// Run with: deno run --allow-read --allow-write scripts/video-data-formatter.ts

// @ts-ignore
declare const Deno: any;

// Configuration
const CONFIG = {
  // Only process Spanish JSON files updated after this timestamp
  // Set to null to process all files, or set to a specific date string
  minTimestamp: "2025-07-02T00:00:00.000Z", // Example: only process files from July 3rd, 2025 onwards
  // Set to null to process all files regardless of timestamp
  // minTimestamp: null,
};

interface VideoFile {
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

interface SpanishStatement {
  cloudinaryUrl: string;
  publicId: string;
  audioFiles: VideoFile[]; // These are now video files with embedded audio
  timestamp: string;
}

interface VideoData {
  videoName: string; // Short name for reference
  originalUrl: string; // Original Cloudinary video URL
  videoFiles: Array<{
    url: string; // CreatorMate URL
    transcript: string;
    answer: boolean;
    speed: number;
    translation: string;
  }>;
}

interface CSVVideoAnalysis {
  cloudinaryUrl: string;
  publicId: string;
  analysis: {
    description: string;
    shortFilename?: string;
    targetAnswer?: boolean;
  };
  timestamp: string;
}

interface CSVVideoCollection {
  videos: CSVVideoAnalysis[];
  totalVideos: number;
  processedAt: string;
}

// Load the CSV-generated video collection
async function loadCSVVideoCollection(): Promise<CSVVideoAnalysis[]> {
  try {
    console.log(`📖 Loading CSV-generated video collection...`);
    
    const csvJsonPath = './json/video-analysis-collection-from-csv.json';
    const content = await Deno.readTextFile(csvJsonPath);
    const collection: CSVVideoCollection = JSON.parse(content);
    
    console.log(`📄 Found ${collection.videos.length} videos in CSV collection`);
    return collection.videos;
    
  } catch (error) {
    console.error(`❌ Error loading CSV video collection:`, error.message);
    throw error;
  }
}

// Read and parse Spanish statement file by shortname
async function readSpanishStatementFile(shortname: string): Promise<SpanishStatement | null> {
  try {
    const filename = `./json/spanish-s-${shortname}.json`;
    console.log(`📖 Reading: ${filename}`);
    
    const content = await Deno.readTextFile(filename);
    const statement: SpanishStatement = JSON.parse(content);
    
    // Check if file meets timestamp requirements
    if (CONFIG.minTimestamp) {
      const fileTimestamp = new Date(statement.timestamp);
      const minTimestamp = new Date(CONFIG.minTimestamp);
      
      if (fileTimestamp < minTimestamp) {
        console.log(`⏭️  Skipping ${shortname} - file timestamp (${statement.timestamp}) is older than minimum (${CONFIG.minTimestamp})`);
        return null;
      }
    }
    
    return statement;
  } catch (error) {
    console.log(`⚠️  No Spanish statement file found for: ${shortname}`);
    return null;
  }
}

// Copy content to clipboard using pbcopy (macOS)
async function copyToClipboard(content: string): Promise<void> {
  try {
    const process = Deno.run({
      cmd: ['pbcopy'],
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped'
    });
    
    const encoder = new TextEncoder();
    await process.stdin.write(encoder.encode(content));
    await process.stdin.close();
    
    const status = await process.status();
    if (status.success) {
      console.log(`📋 Copied to clipboard!`);
    } else {
      console.log(`⚠️  Failed to copy to clipboard (but file was saved)`);
    }
  } catch (error) {
    console.log(`⚠️  Could not copy to clipboard: ${error.message} (but file was saved)`);
  }
}

// Main function
async function main() {
  console.log('🎬 Video Data Formatter\n');
  
  // Show configuration
  console.log('📋 Configuration:');
  console.log(`   Min timestamp: ${CONFIG.minTimestamp || 'None (process all files)'}`);
  console.log('');
  
  try {
    // Load the CSV-generated video collection
    const csvVideos = await loadCSVVideoCollection();
    
    if (csvVideos.length === 0) {
      console.log('📭 No videos found in CSV collection');
      return;
    }
    
    console.log(`📹 Processing ${csvVideos.length} videos from CSV collection...`);
    
    // Convert to the required format - create one entry per video with nested speeds
    const VIDEOS: VideoData[] = [];
    let processedCount = 0;
    let skippedCount = 0;
    
    for (const csvVideo of csvVideos) {
      const shortname = csvVideo.analysis.shortFilename;
      
      if (!shortname) {
        console.log(`⚠️  Skipping video without shortname: ${csvVideo.publicId}`);
        skippedCount++;
        continue;
      }
      
      try {
        // Try to find corresponding Spanish statement file
        const statement = await readSpanishStatementFile(shortname);
        
        if (!statement) {
          console.log(`⏭️  Skipping ${shortname} - no Spanish statement file found or timestamp too old`);
          skippedCount++;
          continue;
        }
        

        
        // Create videoFiles array for this video
        const videoFiles: Array<{
          url: string;
          transcript: string;
          answer: boolean;
          speed: number;
          translation: string;
        }> = [];
        
        // Add each speed as a separate video object
        for (const videoFile of statement.audioFiles) {
          // Skip if no CreatorMate URL
          if (!videoFile.creatomateUrl) {
            console.log(`⚠️  Skipping ${videoFile.filename} - no CreatorMate URL`);
            continue;
          }
          
          videoFiles.push({
            url: videoFile.creatomateUrl,
            transcript: videoFile.transcript,
            answer: videoFile.answer,
            speed: videoFile.speed,
            translation: videoFile.translation
          });
        }
        
        // Only add if we have videoFiles with CreatorMate URLs
        if (videoFiles.length > 0) {
          VIDEOS.push({
            videoName: shortname,
            originalUrl: csvVideo.cloudinaryUrl,
            videoFiles: videoFiles
          });
        }
        
        console.log(`✅ Processed: ${shortname} (${videoFiles.length} video speeds)`);
        processedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to process ${shortname}:`, error.message);
        skippedCount++;
      }
    }
    
    // Create the output string
    const output = `const VIDEOS = ${JSON.stringify(VIDEOS, null, 2)};`;
    
    // Save to file
    const outputFile = './video-data-array.ts';
    await Deno.writeTextFile(outputFile, output);
    
    console.log(`\n✅ Formatted ${VIDEOS.length} video entries`);
    console.log(`💾 Saved to: ${outputFile}`);
    
    // Copy to clipboard
    await copyToClipboard(output);
    
    // Show summary
    console.log(`\n📊 Summary:`);
    console.log(`   Total CSV videos: ${csvVideos.length}`);
    console.log(`   Processed: ${processedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Videos with Spanish data: ${VIDEOS.length}`);
    
    let totalVideoSpeeds = 0;
    let trueCount = 0;
    let falseCount = 0;
    const speedCounts: { [key: number]: number } = {};
    
    for (const video of VIDEOS) {
      totalVideoSpeeds += video.videoFiles.length;
      
      for (const speedVideo of video.videoFiles) {
        if (speedVideo.answer === true) {
          trueCount++;
        } else {
          falseCount++;
        }
        
        speedCounts[speedVideo.speed] = (speedCounts[speedVideo.speed] || 0) + 1;
      }
    }
    
    console.log(`   Total video speeds: ${totalVideoSpeeds}`);
    console.log(`   True statements: ${trueCount}`);
    console.log(`   False statements: ${falseCount}`);
    console.log(`   Speed distribution:`);
    Object.keys(speedCounts).sort().forEach(speed => {
      console.log(`     ${speed}x: ${speedCounts[Number(speed)]} videos`);
    });
    
    // Show sample of first video
    if (VIDEOS.length > 0) {
      console.log('\n📋 Sample output:');
      console.log(JSON.stringify(VIDEOS[0], null, 2));
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    Deno.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main();
}