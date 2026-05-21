$about = @"
I am an AI Solutions Architect and UX Developer building practical AI-powered digital solutions at the intersection of business strategy, human-centered design, and rapid product execution.

My background is intentionally multidisciplinary: finance, government banking, client success, healthcare operations, international communications, UX thinking, AI-assisted development, and creative production. This gives me a rare ability to understand both the business problem and the user experience behind it.

Over the last decade, I have worked across strategic relationship management, executive communication, customer engagement, and operations. At Kotak Mahindra Bank, I managed high-value government and institutional relationships, delivered strategic presentations to senior stakeholders, and contributed to one of Maharashtra's largest government banking portfolios.

Today, my focus is on translating complex ideas into clear, usable, AI-enabled products and workflows.

Core areas of work:

- AI-assisted software development
- UX/UI redesign and rapid prototyping
- Business process and knowledge solutions
- Client success and strategic communication
- Human-centered digital transformation
- Prompt engineering and AI workflow design

What makes my approach different is the combination of business fluency, communication depth, technical curiosity, and creative intuition. I can speak with stakeholders, identify friction, map user journeys, and turn vague requirements into structured digital outcomes.

I am especially interested in building practical AI systems that improve clarity, speed, creativity, and decision-making for real users and real businesses.
"@

Add-Type -AssemblyName System.Windows.Forms
Set-Clipboard -Value $about

Write-Host "About section copied to clipboard."
Write-Host ""
Write-Host "You have 8 seconds. Click inside the LinkedIn About text box now."

Start-Sleep -Seconds 8

[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('^v')

Write-Host "About section pasted. Review it in LinkedIn, then click Save manually."
