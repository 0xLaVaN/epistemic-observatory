import './globals.css'

export const metadata = {
  title: 'Epistemic Observatory | Agent Calibration Theatre',
  description: 'The first verifiable epistemic primitive for AI agents. Track calibration, verify identity, build trust.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-void antialiased">
        {children}
      </body>
    </html>
  )
}
