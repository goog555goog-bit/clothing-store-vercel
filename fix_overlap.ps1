$folders = @("c:\Users\User\.gemini\antigravity\scratch\clothing-store-vercel", "c:\Users\User\.gemini\antigravity\scratch\clothing-store")
foreach ($folder in $folders) {
    $files = Get-ChildItem -Path $folder -Include *.html,*.js,*.gs,*.css -Recurse
    foreach ($f in $files) {
        $content = [System.IO.File]::ReadAllText($f.FullName)
        $newContent = $content
        $newContent = $newContent -replace 'class="flex gap-1"','class="flex flex-wrap gap-1"'
        $newContent = $newContent -replace 'class="flex gap-2"','class="flex flex-wrap gap-2"'
        
        # Add flex-wrap class to css files if missing
        if ($f.Extension -eq ".css" -and $newContent -notmatch '\.flex-wrap\b') {
            $newContent = $newContent + "`r`n.flex-wrap { flex-wrap: wrap; }`r`n"
        }
        # Add flex-wrap class to style.html files if missing
        if ($f.Name -eq "style.html" -and $newContent -notmatch '\.flex-wrap\b') {
            $newContent = $newContent -replace '</style>',".flex-wrap { flex-wrap: wrap; }`r`n</style>"
        }
        
        if ($content -ne $newContent) {
            [System.IO.File]::WriteAllText($f.FullName, $newContent)
            Write-Host "Updated $($f.FullName)"
        }
    }
}
