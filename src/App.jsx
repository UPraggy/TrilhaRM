import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Trilha from './pages/Trilha.jsx'
import Modulo from './pages/Modulo.jsx'
import Licao from './pages/Licao.jsx'
import Resultado from './pages/Resultado.jsx'
import Biblioteca from './pages/Biblioteca.jsx'
import Perfil from './pages/Perfil.jsx'
import Anatomia from './pages/Anatomia.jsx'
import DeckPage from './pages/DeckPage.jsx'
import Estudo from './pages/Estudo.jsx'
import Glossario from './pages/Glossario.jsx'
import Matriz from './pages/Matriz.jsx'
import Cursos from './pages/Cursos.jsx'
import Curso from './pages/Curso.jsx'
import LicaoCurso from './pages/LicaoCurso.jsx'
import Config from './pages/Config.jsx'
import Praticas from './pages/Praticas.jsx'
import Treinos from './pages/Treinos.jsx'
import Treino from './pages/Treino.jsx'
import Pratica from './pages/Pratica.jsx'
import DiarioErros from './pages/DiarioErros.jsx'
import Entrevista from './pages/Entrevista.jsx'
import Duelo from './pages/Duelo.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />

        {/* o caminho: trilha -> modulo -> licao */}
        <Route path="/trilha" element={<Trilha />} />
        <Route path="/trilha/:id" element={<Trilha />} />
        <Route path="/modulo/:id" element={<Modulo />} />
        <Route path="/licao/:moduloId/:n" element={<Licao />} />
        <Route path="/resultado/:moduloId/:n" element={<Resultado />} />
        <Route path="/duelo/:moduloId/:n" element={<Duelo />} />
        <Route path="/entrevista/:moduloId" element={<Entrevista />} />

        {/* biblioteca (escolher em vez de seguir) */}
        <Route path="/biblioteca" element={<Biblioteca />} />
        <Route path="/glossario" element={<Glossario />} />
        <Route path="/cursos" element={<Cursos />} />
        <Route path="/curso/:id" element={<Curso />} />
        <Route path="/curso/:id/licao/:licaoId" element={<LicaoCurso />} />
        <Route path="/praticas" element={<Praticas />} />
        <Route path="/pratica/:deckId/:exId" element={<Pratica />} />
        <Route path="/treinos" element={<Treinos />} />
        <Route path="/treino/:id" element={<Treino />} />
        <Route path="/deck/:id" element={<DeckPage />} />
        <Route path="/estudar/:modo" element={<Estudo />} />

        {/* perfil (medir, revisar, ajustar) */}
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/perfil/erros" element={<DiarioErros />} />
        <Route path="/matriz" element={<Matriz />} />
        <Route path="/anatomia" element={<Anatomia />} />
        <Route path="/config" element={<Config />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
