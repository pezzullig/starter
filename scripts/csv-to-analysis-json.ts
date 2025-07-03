// CSV to Analysis JSON Converter
// Converts the CSV file to a single JSON file matching the analysis-* format
// Run with: deno run --allow-read --allow-write scripts/csv-to-analysis-json.ts

interface VideoAnalysisResult {
  cloudinaryUrl: string;
  publicId: string;
  analysis: {
    description: string;
    shortFilename?: string;
    targetAnswer?: boolean;
  };
  timestamp: string;
}

interface VideoAnalysisCollection {
  videos: VideoAnalysisResult[];
  totalVideos: number;
  processedAt: string;
}

// Extract public ID from Cloudinary URL
function extractPublicId(url: string): string {
  // Handle both embed URLs and direct URLs
  if (url.includes('player.cloudinary.com')) {
    const match = url.match(/public_id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } else if (url.includes('res.cloudinary.com')) {
    // Extract from direct URL like: https://res.cloudinary.com/dtszsqfxo/video/upload/v1751276447/ssstik.io__jonathantetelman_1751275030857_educbm.mp4
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace('.mp4', '');
  }
  return '';
}

// Convert CSV row to VideoAnalysisResult
function csvRowToVideoAnalysis(row: string[]): VideoAnalysisResult | null {
  if (row.length < 4) return null;
  
  const [videoName, link, trueFalse, description] = row;
  
  if (!link || !description) return null;
  
  const publicId = extractPublicId(link);
  if (!publicId) return null;
  
  // Convert TRUE/FALSE to boolean
  const targetAnswer = trueFalse?.toUpperCase() === 'TRUE';
  
  // Create short filename from video name
  const shortFilename = videoName
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || publicId;
  
  return {
    cloudinaryUrl: link,
    publicId: publicId,
    analysis: {
      description: description.trim(),
      shortFilename: shortFilename,
      targetAnswer: targetAnswer
    },
    timestamp: new Date().toISOString()
  };
}

// Parse CSV content
function parseCSV(csvContent: string): VideoAnalysisResult[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const videos: VideoAnalysisResult[] = [];
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split by comma, but handle quoted fields
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    row.push(current.trim());
    
    const video = csvRowToVideoAnalysis(row);
    if (video) {
      videos.push(video);
    } else {
      console.log(`⚠️  Skipped invalid row: ${line}`);
    }
  }
  
  return videos;
}

// Main function
async function main() {
  try {
    console.log('📊 CSV to Analysis JSON Converter\n');
    
    // Read CSV file
    const csvPath = './media/1-Habbly vids - 8 second files.csv';
    console.log(`📖 Reading CSV file: ${csvPath}`);
    
    const csvContent = await Deno.readTextFile(csvPath);
    console.log(`✅ Read ${csvContent.length} characters`);
    
    // Parse CSV
    console.log(`🔄 Parsing CSV content...`);
    const videos = parseCSV(csvContent);
    console.log(`✅ Parsed ${videos.length} videos`);
    
    // Create collection object
    const collection: VideoAnalysisCollection = {
      videos: videos,
      totalVideos: videos.length,
      processedAt: new Date().toISOString()
    };
    
    // Save to JSON file
    const outputPath = './json/video-analysis-collection-from-csv.json';
    console.log(`💾 Saving to: ${outputPath}`);
    
    await Deno.writeTextFile(outputPath, JSON.stringify(collection, null, 2));
    console.log(`✅ Saved ${videos.length} videos to JSON`);
    
    // Display summary
    console.log(`\n📊 Summary:`);
    console.log(`   Total videos: ${videos.length}`);
    console.log(`   TRUE statements: ${videos.filter(v => v.analysis.targetAnswer === true).length}`);
    console.log(`   FALSE statements: ${videos.filter(v => v.analysis.targetAnswer === false).length}`);
    console.log(`   Undefined answers: ${videos.filter(v => v.analysis.targetAnswer === undefined).length}`);
    
    // Show sample entries
    console.log(`\n📋 Sample entries (first 3):`);
    videos.slice(0, 3).forEach((video, index) => {
      console.log(`   ${index + 1}. ${video.analysis.shortFilename}`);
      console.log(`      Public ID: ${video.publicId}`);
      console.log(`      Target Answer: ${video.analysis.targetAnswer}`);
      console.log(`      Description: ${video.analysis.description.substring(0, 50)}...`);
    });
    
    console.log(`\n✅ Conversion completed!`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
} 