# 🚀 TypeScript Prototyping Setup - Complete Guide

This is your personal quick prototyping environment with Deno, designed for rapid development without worrying about TypeScript strict rules.

## 🎯 What's Included

- ✅ **No Type Checking** - Fast development without type errors
- ✅ **API Utilities** - Built-in functions for HTTP requests
- ✅ **VS Code Debugging** - Full debugging support with breakpoints
- ✅ **Development Server** - Local server for testing APIs
- ✅ **Template Scripts** - Ready-to-use examples and templates

## 📁 Project Structure

```
├── scripts/
│   ├── api-example.ts      # Working API calls example
│   ├── debug-example.ts    # Debugging with breakpoints
│   ├── dev.ts             # Development server (port 8000)
│   └── template.ts        # Template for new scripts
├── .vscode/
│   ├── launch.json        # Debug configurations
│   └── settings.json      # Deno settings
├── deno.json             # Project config (no strict typing)
├── PROTOTYPING.md        # Quick reference
└── README-PROTOTYPING.md # This detailed guide
```

## 🛠️ Quick Start

### 1. Run API Example
```bash
deno task api-example
```
**Output:** Fetches users and posts from JSONPlaceholder API, creates a new post

### 2. Start Development Server
```bash
deno task dev
```
**Server:** http://localhost:8000
**Endpoints:**
- `GET /` - Server status
- `GET /api/health` - Health check
- `GET /api/users` - Sample users
- `GET /api/weather?city=London` - Weather data

### 3. Test Server Endpoints
```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/users
curl "http://localhost:8000/api/weather?city=Tokyo"
```

## 📝 Writing Scripts

### Method 1: Use the Template
```bash
# Copy the template
cp scripts/template.ts scripts/my-script.ts

# Edit the file
code scripts/my-script.ts

# Run it
deno run --allow-net scripts/my-script.ts
```

### Method 2: Create from Scratch
```typescript
// scripts/my-new-script.ts
// Run with: deno run --allow-net scripts/my-new-script.ts

// Your interfaces (optional - use 'any' for quick prototyping)
interface MyData {
  id: number;
  name: string;
  data: any; // Use 'any' to avoid type issues
}

// Utility function for API calls
async function fetchApi<T>(url: string): Promise<T> {
  try {
    console.log(`🌐 Fetching: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✅ Success: ${url}`);
    return data;
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error.message);
    throw error;
  }
}

// Your main logic
async function main() {
  console.log('🚀 Starting your script...');
  
  try {
    // Example: Fetch data from an API
    const data = await fetchApi<MyData[]>('https://api.example.com/data');
    console.log(`📊 Found ${data.length} items`);
    
    // Process the data
    data.forEach(item => {
      console.log(`Processing: ${item.name}`);
      // Your custom logic here
    });
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
}
```

### Common Script Patterns

#### 1. API Data Processing
```typescript
async function processApiData() {
  const users = await fetchApi<User[]>('https://jsonplaceholder.typicode.com/users');
  
  // Transform data
  const userNames = users.map(user => user.name);
  console.log('User names:', userNames);
  
  // Filter data
  const activeUsers = users.filter(user => user.id <= 5);
  console.log('Active users:', activeUsers);
}
```

#### 2. Multiple API Calls
```typescript
async function fetchMultipleApis() {
  try {
    // Parallel requests
    const [users, posts] = await Promise.all([
      fetchApi<User[]>('https://jsonplaceholder.typicode.com/users'),
      fetchApi<Post[]>('https://jsonplaceholder.typicode.com/posts')
    ]);
    
    console.log(`Users: ${users.length}, Posts: ${posts.length}`);
    
  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}
```

#### 3. File Operations
```typescript
// Read file
const content = await Deno.readTextFile('./data.json');
const data = JSON.parse(content);

// Write file
const result = { processed: true, data };
await Deno.writeTextFile('./output.json', JSON.stringify(result, null, 2));
```

## 🐛 Debugging Guide

### Method 1: VS Code Debugging (Recommended)

1. **Set Breakpoints**
   - Open your script in VS Code
   - Click on the line number to set a red dot (breakpoint)
   - You can set multiple breakpoints

2. **Start Debugging**
   - Press `F5` or go to Run → Start Debugging
   - Select "Debug Current File" or "Debug Script"
   - The debugger will pause at your first breakpoint

3. **Debug Controls**
   - `F5` - Continue execution
   - `F10` - Step over (execute current line)
   - `F11` - Step into (go into function)
   - `Shift+F11` - Step out (exit current function)
   - `F9` - Toggle breakpoint

4. **Debug Panels**
   - **Variables** - See all local variables
   - **Watch** - Add expressions to monitor
   - **Call Stack** - See function call history
   - **Breakpoints** - Manage all breakpoints

### Method 2: Console Debugging

```typescript
// Add these to your scripts for quick debugging
console.log('🔍 Variable value:', myVariable);
console.log('📊 Object:', JSON.stringify(myObject, null, 2));
console.log('⏱️  Timestamp:', new Date().toISOString());

// Debug with breakpoints in code
debugger; // This will pause execution if debugging

// Conditional logging
if (process.env.DEBUG) {
  console.log('Debug info:', debugData);
}
```

### Method 3: Chrome DevTools

```bash
# Run script with debugging enabled
deno run --inspect-brk --allow-net scripts/debug-example.ts

# Open Chrome and go to chrome://inspect
# Click "inspect" on your script
```

### Debugging Tips

#### 1. Inspect API Responses
```typescript
async function debugApiCall() {
  try {
    const response = await fetch('https://api.example.com/data');
    console.log('🔍 Response status:', response.status);
    console.log('🔍 Response headers:', Object.fromEntries(response.headers));
    
    const data = await response.json();
    console.log('🔍 Response data:', JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('❌ API Error:', error);
    throw error;
  }
}
```

#### 2. Step-by-Step Processing
```typescript
async function processWithDebugging() {
  console.log('1️⃣ Starting process...');
  
  const rawData = await fetchApi('/api/data');
  console.log('2️⃣ Raw data received:', rawData);
  
  const processed = rawData.map(item => {
    console.log('3️⃣ Processing item:', item);
    return { ...item, processed: true };
  });
  console.log('4️⃣ Processed data:', processed);
  
  return processed;
}
```

#### 3. Error Debugging
```typescript
async function robustApiCall() {
  try {
    const data = await fetchApi('/api/data');
    return data;
  } catch (error) {
    console.error('🔍 Error details:');
    console.error('  Message:', error.message);
    console.error('  Stack:', error.stack);
    console.error('  Type:', error.constructor.name);
    
    // Re-throw or handle gracefully
    throw error;
  }
}
```

## 🔧 Configuration Details

### deno.json Settings
```json
{
  "compilerOptions": {
    "strict": false,           // No strict type checking
    "noImplicitAny": false,   // Allow implicit any
    "noUnusedLocals": false,  // No unused variable warnings
    "allowJs": true           // Allow JavaScript files
  }
}
```

### VS Code Launch Configurations
- **Debug Current File** - Debugs the currently open file
- **Debug Script** - Debugs `scripts/debug-example.ts`

## 🎯 Available Tasks

```bash
# Run examples
deno task api-example      # API calls example
deno task debug-example    # Debugging example
deno task dev             # Start development server

# Run custom scripts
deno run --allow-net scripts/your-script.ts
deno run --allow-net --allow-read --allow-write scripts/your-script.ts
```

## 🚨 Common Issues & Solutions

### Permission Errors
```bash
# Add required permissions
deno run --allow-net --allow-read --allow-write --allow-env your-script.ts
```

### Import Errors
```typescript
// Use full URLs for external modules
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
```

### Debugging Not Working
1. Install Deno VS Code extension
2. Ensure `deno.enable` is `true` in VS Code settings
3. Use `--inspect-brk` flag for manual debugging

### Type Errors (Even with Strict Mode Off)
```typescript
// Use 'any' type for quick prototyping
const data: any = await fetch('/api/data');
const result = data.someProperty; // No type checking
```

## 🎉 Best Practices

1. **Start Simple** - Use the template and modify it
2. **Console Log Everything** - Add lots of `console.log()` statements
3. **Use Breakpoints** - Set breakpoints for complex logic
4. **Handle Errors** - Wrap API calls in try-catch blocks
5. **Test Incrementally** - Test small parts before building complex logic

## 📚 Example Workflow

1. **Create a new script**: `cp scripts/template.ts scripts/my-idea.ts`
2. **Add your logic**: Edit the file with your API calls and processing
3. **Add debugging**: Insert `console.log()` and set breakpoints
4. **Test**: Run with `deno run --allow-net scripts/my-idea.ts`
5. **Debug**: Use F5 in VS Code to step through code
6. **Iterate**: Make changes and test again

## 🎯 Remember

- **No type checking** = Fast prototyping
- **Use `any` type** when you don't know the structure
- **Console.log everything** for quick debugging
- **Set breakpoints** for complex logic
- **Copy the template** for new scripts

Happy prototyping! 🚀 