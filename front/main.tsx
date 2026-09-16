import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './App.css'
import App from './App'
import Landing from './routes/Landing'
import Home from './routes/Home'
import DocumentEditor from './routes/DocumentEditor'
import SharedWithMe from './routes/SharedWithMe'
import NotFound from './routes/NotFound'

// The app used to live at the site root; it moved to /app so / could become
// a real landing page. These keep any old bookmarked/shared links working
// instead of dead-ending in a 404.
function RedirectToDocument() {
  const { documentId } = useParams()
  return <Navigate to={`/app/document/${documentId}`} replace />
}

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/shared', element: <Navigate to="/app/shared" replace /> },
  { path: '/document/:documentId', element: <RedirectToDocument /> },
  {
    path: '/app',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'document/:documentId', element: <DocumentEditor /> },
      { path: 'shared', element: <SharedWithMe /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <ToastContainer position="bottom-right" theme="dark" />
  </React.StrictMode>,
)
