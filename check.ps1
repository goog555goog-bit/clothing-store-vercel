$bytes = [System.IO.File]::ReadAllBytes("c:\Users\User\.gemini\antigravity\scratch\clothing-store-vercel\admin.html")
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$lines = $text -split "`n"
Write-Host "Total lines: $($lines.Count)"
Write-Host ""

# Check lines 3186-3210 
Write-Host "=== Lines 3186-3210 ==="
for ($i = 3185; $i -lt 3210 -and $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    $hasProblems = $false
    
    for ($j = 0; $j -lt $line.Length; $j++) {
        $code = [int][char]$line[$j]
        if ($code -eq 8216 -or $code -eq 8217) {
            Write-Host "Line ${lineNum} pos ${j}: SMART SINGLE QUOTE (U+$($code.ToString('X4')))"
            $hasProblems = $true
        }
        elseif ($code -eq 8220 -or $code -eq 8221) {
            Write-Host "Line ${lineNum} pos ${j}: SMART DOUBLE QUOTE (U+$($code.ToString('X4')))"
            $hasProblems = $true
        }
        elseif ($code -eq 160) {
            Write-Host "Line ${lineNum} pos ${j}: NON-BREAKING SPACE (U+00A0)"
            $hasProblems = $true
        }
        elseif ($code -eq 8203) {
            Write-Host "Line ${lineNum} pos ${j}: ZERO-WIDTH SPACE (U+200B)"
            $hasProblems = $true
        }
        elseif ($code -eq 65279) {
            Write-Host "Line ${lineNum} pos ${j}: BOM (U+FEFF)"
            $hasProblems = $true
        }
    }
    
    if (-not $hasProblems) {
        $display = $line.TrimEnd()
        if ($display.Length -gt 100) { $display = $display.Substring(0, 100) }
        Write-Host "Line ${lineNum}: OK | $display"
    }
}

Write-Host ""
Write-Host "=== Scanning ENTIRE file for smart quotes ==="
for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    for ($j = 0; $j -lt $line.Length; $j++) {
        $code = [int][char]$line[$j]
        if ($code -eq 8216 -or $code -eq 8217 -or $code -eq 8220 -or $code -eq 8221) {
            $start = [Math]::Max(0, $j - 15)
            $len = [Math]::Min(30, $line.Length - $start)
            $ctx = $line.Substring($start, $len)
            Write-Host "Line ${lineNum} pos ${j}: U+$($code.ToString('X4')) context: $ctx"
        }
    }
}

Write-Host "Done."
