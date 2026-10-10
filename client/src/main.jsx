import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { RouterProvider } from 'react-router'
import { AuthProvider } from '@/context/AuthProvider'
import { router } from '@/router'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          className: '!text-sm !font-medium !rounded-xl !shadow-lg',
          success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
        }}
      />
    </AuthProvider>
  </StrictMode>,
)
