import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import DeckPage from './pages/DeckPage.jsx'
import Estudo from './pages/Estudo.jsx'
import Glossario from './pages/Glossario.jsx'
import Matriz from './pages/Matriz.jsx'
import Cursos from './pages/Cursos.jsx'
import Curso from './pages/Curso.jsx'
import Licao from './pages/Licao.jsx'
import Config from './pages/Config.jsx'
import Praticas from './pages/Praticas.jsx'
import Treinos from './pages/Treinos.jsx'
import Treino from './pages/Treino.jsx'
import Pratica from './pages/Pratica.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/deck/:id" element={<DeckPage />} />
        <Route path="/estudar/:modo" element={<Estudo />} />
        <Route path="/glossario" element={<Glossario />} />
        <Route path="/matriz" element={<Matriz />} />
        <Route path="/cursos" element={<Cursos />} />
        <Route path="/curso/:id" element={<Curso />} />
        <Route path="/curso/:id/licao/:licaoId" element={<Licao />} />
        <Route path="/config" element={<Config />} />
        <Route path="/praticas" element={<Praticas />} />
        <Route path="/pratica/:deckId/:exId" element={<Pratica />} />
        <Route path="/treinos" element={<Treinos />} />
        <Route path="/treino/:id" element={<Treino />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
