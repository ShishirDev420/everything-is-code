$headline = "AI Solutions Architect & UX Developer | Vibe Coding, Rapid Prototyping & AI Workflows"

Add-Type -AssemblyName System.Windows.Forms
Set-Clipboard -Value $headline

Write-Host "Headline copied to clipboard:"
Write-Host $headline
Write-Host ""
Write-Host "You have 8 seconds. Click inside the LinkedIn Headline field now."

Start-Sleep -Seconds 8

[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('^v')

Write-Host "Headline pasted. Review it in LinkedIn, then click Save manually."
