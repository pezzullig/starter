# 🚀 TypeScript Prototyping Setup

This setup is designed for quick TypeScript prototyping with Deno, featuring:
- **No type checking** - Fast development without type errors
- **API calls** - Built-in utilities for making HTTP requests
- **Debugging** - Full VS Code debugging support with breakpoints
- **Hot reloading** - Development server for quick iteration

## 🛠️ Quick Start

### 1. Run API Example
```bash
# Run the API example script
deno task api-example

# Or run directly
deno run --allow-net scripts/api-example.ts
```

### 2. Start Development Server
```bash
# Start the local development server
deno task dev

# Server will be available at http://localhost:8000
```

### 3. Debug with Breakpoints
```bash
# Run debug example with breakpoints
deno task debug-example

# Then open Chrome DevTools at chrome://inspect
```

## 📁 Project Structure

```
├── scripts/
│   ├── api-example.ts      # API calling examples
│   ├── debug-example.ts    # Debugging examples
│   └── dev.ts             # Development server
├── .vscode/
│   ├── launch.json        # VS Code debug configuration
│   └── settings.json      # Deno settings
├── deno.json             # Project configuration
└── PROTOTYPING.md        # This file
```

## 🔧 Configuration

### TypeScript Settings (deno.json)
- **No strict type checking** - `"strict": false`
- **Allow JavaScript** - `"allowJs": true`
- **No unused variable warnings** - `"noUnusedLocals": false`

### VS Code Debugging
Two debug configurations available:
1. **Debug Script** - Debugs `scripts/debug-example.ts`
2. **Debug Current File** - Debugs the currently open file

## 📝 Usage Examples

### Making API Calls

```typescript
// Quick API call with error handling
async function fetchData() {
  try {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    console.log('✅ Data received:', data);
    return data;
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}
```

### Creating New Scripts

1. Create a new file in `scripts/` directory
2. Add your TypeScript code (no need to worry about types!)
3. Run with: `deno run --allow-net scripts/your-script.ts`

Example script template:
```typescript
// Your script name
// Run with: deno run --allow-net scripts/your-script.ts

async function main() {
  console.log('🚀 Your script is running!');
  
  // Your code here
  const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
  const data = await response.json();
  console.log('Data:', data);
}

if (import.meta.main) {
  main();
}
```

### Debugging

1. **Set breakpoints** in VS Code by clicking on line numbers
2. **Start debugging**:
   - Press F5 or use Run → Start Debugging
   - Select "Debug Current File" or "Debug Script"
3. **Step through code**:
   - F10: Step over
   - F11: Step into
   - Shift+F11: Step out
   - F5: Continue

### Development Server

The dev server provides quick API endpoints for testing:

```bash
# Start server
deno task dev

# Test endpoints
curl http://localhost:8000/api/health
curl http://localhost:8000/api/users
curl "http://localhost:8000/api/weather?city=London"
```

## 🎯 Available Tasks

```bash
# Run API example
deno task api-example

# Start development server
deno task dev

# Run debug example
deno task debug-example
```

## 🔍 Debugging Tips

1. **Console Logging**: Use `console.log()` for quick debugging
2. **Breakpoints**: Set breakpoints in VS Code for step-by-step debugging
3. **Error Handling**: Wrap API calls in try-catch blocks
4. **Type Inspection**: Use the debugger to inspect variables and objects

## 🚨 Common Issues

### Permission Denied
If you get permission errors, add the required flags:
```bash
deno run --allow-net --allow-read --allow-write --allow-env your-script.ts
```

### Import Errors
For external modules, use full URLs:
```typescript
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
```

### Debugging Not Working
1. Make sure you have the Deno VS Code extension installed
2. Check that `deno.enable` is set to `true` in VS Code settings
3. Use the `--inspect-brk` flag when running scripts manually

## 🎉 Happy Prototyping!

This setup is designed for rapid development. Don't worry about perfect types or strict rules - just focus on getting your ideas working quickly! 