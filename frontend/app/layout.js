import './globals.css'

export const metadata = {
  title: 'Prescience | Prediction Market Intelligence',
  description: 'The money speaks before the news. 533+ markets scanned. Whale detection. Real-time intelligence.',
  icons: {
    icon: '/icon.svg',
  },
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
