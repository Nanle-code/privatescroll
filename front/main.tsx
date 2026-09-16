import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './App.css'
import App from './App'
import Home from './routes/Home'
import DocumentEditor from './routes/DocumentEditor'
import SharedWithMe from './routes/SharedWithMe'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'document/:documentId', element: <DocumentEditor /> },
      { path: 'shared', element: <SharedWithMe /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <ToastContainer position="bottom-right" theme="dark" />
  </React.StrictMode>,
)
