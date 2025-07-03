# 🐛 Debugging Setup Guide

## Issue: "Can't find Node.js binary 'deno'"

This error occurs because VS Code is trying to use Deno as a Node.js binary. Here's how to fix it:

## 🔧 Solution Steps

### 1. Install Deno VS Code Extension
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X or Cmd+Shift+X)
3. Search for "Deno"
4. Install the official "Deno" extension by denoland

### 2. Verify Deno Installation
```bash
# Check if Deno is in PATH
which deno

# Should show: /Users/giuliopezzulli/.deno/bin/deno
```

### 3. Debugging Methods

#### Method A: VS Code Debugging (Fixed Configuration)
The launch configuration now uses the absolute path to Deno:
```json
"runtimeExecutable": "/Users/giuliopezzulli/.deno/bin/deno"
```

1. Open any `.ts` file in the `scripts/` folder
2. Set breakpoints by clicking on line numbers
3. Press `F5` and select "Debug Current File" or "Deno: Debug Current File"
4. The debugger should now work properly

#### Method B: Attach Mode (Alternative)
1. First, run your script with debugging enabled:
   ```bash
   deno run --inspect-brk --allow-net scripts/debug-example.ts
   ```
2. Press `F5` and select "Attach to Deno"
3. The debugger will connect to the running process

#### Method C: Manual Debugging
```bash
# Run script with debugging enabled
deno run --inspect-brk --allow-net scripts/debug-example.ts

# Open Chrome and go to chrome://inspect
# Click "inspect" on your script
```

#### Method D: Console Debugging
```typescript
// Add this line where you want to pause
debugger;

// Run normally
deno run --allow-net scripts/your-script.ts
```

### 4. VS Code Settings Check
Make sure your `.vscode/settings.json` contains:
```json
{
    "deno.enable": true,
    "deno.lint": true,
    "deno.unstable": false,
    "deno.suggest.imports.hosts": {
        "https://deno.land": true
    }
}
```

### 5. Launch Configuration
The `.vscode/launch.json` now includes:
- **Debug Current File** - Uses absolute path to Deno
- **Deno: Debug Current File** - Alternative configuration
- **Attach to Deno** - For attaching to running processes

## 🎯 Quick Test

### Test 1: Direct Debugging
1. Open `scripts/debug-example.ts`
2. Set a breakpoint on line 25 (inside the `fetchWeatherData` function)
3. Press `F5` and select "Debug Current File"
4. The debugger should pause at your breakpoint

### Test 2: Attach Mode
1. Open terminal and run:
   ```bash
   deno run --inspect-brk --allow-net scripts/debug-example.ts
   ```
2. Press `F5` and select "Attach to Deno"
3. The debugger should connect and pause at the first line

## 🚨 If Still Not Working

### Option 1: Restart VS Code
1. Close VS Code completely
2. Reopen the project
3. Try debugging again

### Option 2: Use Chrome DevTools
```bash
# Run with debugging
deno run --inspect-brk --allow-net scripts/debug-example.ts

# Open Chrome → chrome://inspect → click "inspect"
```

### Option 3: Console Logging
```typescript
// Add lots of console.log statements
console.log('🔍 Variable:', myVariable);
console.log('📊 Object:', JSON.stringify(myObject, null, 2));
```

### Option 4: Check Deno Path
If the absolute path doesn't work, find your Deno path:
```bash
which deno
# Update the launch.json with your actual path
```

## ✅ Success Indicators

- Breakpoints show as red dots in VS Code
- Debugger pauses at breakpoints when you press F5
- You can inspect variables in the Debug panel
- Step through code with F10/F11

## 🎉 Happy Debugging!

Once working, you can:
- Set breakpoints anywhere in your code
- Inspect variables and objects
- Step through code line by line
- Use the console for quick debugging

## 🔄 Alternative Workflow

If VS Code debugging is still problematic:

1. **Use Chrome DevTools** for complex debugging
2. **Use console.log()** for quick debugging
3. **Use the `debugger;` statement** for simple breakpoints
4. **Use the development server** for API testing 