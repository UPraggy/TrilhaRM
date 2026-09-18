// Persistência do progresso em data/progresso.json com escrita atômica (temp + rename).
import fs from 'node:fs'
import path from 'node:path'
import { avaliar as sm2Avaliar, estadoInicial, hojeISO } from './sm2.js'

const MIN_AVALIACOES_DIA = 10 // dia conta para a ofensiva com >= 10 avaliações

export function progressoVazio() {
  return {
    versao: 3,
    termos: {},
    praticas: {},
    cursos: {},
    // V2: um nó = uma lição do caminho (moduloId/N ou moduloId/chefao). Não confundir com
    // cursos[id].licoes, que são as lições em Markdown de um curso.
    nos: {},
    xp: { total: 0, porDia: {} },
    diario: [], // erros anotados pelo aluno (o que achei / o que era / como detectar)
    entrevistas: {}, // entrevistas simuladas por módulo
    streak: { atual: 0, melhor: 0, ultimoDia: null },
    historico: [],
  }
}

/** estado inicial de um nó do caminho */
export function noInicial() {
  return {
    concluidaEm: null,
    melhorXp: 0,
    ultimoXp: 0,
    ultimoAcerto: null, // 0..1
    historico: [], // { dia, xp, acertos, total, itens: [{ tipo, ref, ok, nota }] }
  }
}

/** estado inicial do progresso de um curso (chave cursoId) */
export function cursoInicial() {
  return {
    licoes: {}, // licaoId -> { vistaEm, concluidaEm }
    ultimaLicao: null, // para "continuar de onde parei"
    ultimoModulo: null,
    iniciadoEm: null,
    atualizadoEm: null,
  }
}

/** estado inicial de um exercício prático (chave deckId/exId) */
export function praticaInicial() {
  return {
    estado: 'nova', // nova | andamento | concluida
    iniciadaEm: null,
    concluidaEm: null,
    tentativasErradas: 0,
    dicasUsadas: 0,
    revelou: false,
    rascunho: '',
    melhorNota: null,
    ultimaNota: null,
    historico: [], // { dia, nota, auto, resposta, avaliacaoIA? }
  }
}

export function criarProgresso(arquivo) {
  const dir = path.dirname(arquivo)
  let estado = null
  let filaEscrita = Promise.resolve()

  function carregar() {
    if (estado) return estado
    try {
      const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
      estado = { ...progressoVazio(), ...bruto }
      estado.termos = estado.termos || {}
      estado.praticas = estado.praticas && typeof estado.praticas === 'object' ? estado.praticas : {}
      // cursos entraram depois: um progresso.json antigo simplesmente ganha o objeto vazio
      estado.cursos = estado.cursos && typeof estado.cursos === 'object' ? estado.cursos : {}
      // V2: progresso.json antigo simplesmente ganha os campos vazios (nada é migrado nem perdido)
      estado.nos = estado.nos && typeof estado.nos === 'object' ? estado.nos : {}
      estado.xp = estado.xp && typeof estado.xp === 'object' ? { total: Number(estado.xp.total) || 0, porDia: estado.xp.porDia || {} } : { total: 0, porDia: {} }
      estado.diario = Array.isArray(estado.diario) ? estado.diario : []
      estado.entrevistas = estado.entrevistas && typeof estado.entrevistas === 'object' ? estado.entrevistas : {}
      estado.versao = 3
      estado.streak = { ...progressoVazio().streak, ...(estado.streak || {}) }
      estado.historico = Array.isArray(estado.historico) ? estado.historico : []
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[progresso] arquivo ilegível, começando do zero:', e.message)
      estado = progressoVazio()
    }
    return estado
  }

  function salvar() {
    const snapshot = JSON.stringify(estado, null, 2)
    filaEscrita = filaEscrita.then(
      () =>
        new Promise((resolve) => {
          fs.mkdir(dir, { recursive: true }, () => {
            const tmp = `${arquivo}.${process.pid}.${Date.now()}.tmp`
            fs.writeFile(tmp, snapshot, 'utf8', (err) => {
              if (err) {
                console.error('[progresso] falha ao escrever temp:', err.message)
                return resolve()
              }
              fs.rename(tmp, arquivo, (err2) => {
                if (err2) {
                  console.error('[progresso] falha no rename:', err2.message)
                  fs.unlink(tmp, () => {})
                }
                resolve()
              })
            })
          })
        }),
    )
    return filaEscrita
  }

  /** se havia uma avaliação IA pendente para este texto, ela entra na resposta recém-gravada */
  function anexarPendenteNaResposta(s, modo, resposta) {
    if (!s || !s.avaliacaoIAPendente) return
    if (modo !== 'explique' || typeof resposta !== 'string') return
    const texto = resposta.trim().slice(0, 4000)
    const lista = s.respostasExplique || []
    const ultima = lista[lista.length - 1]
    if (ultima && ultima.texto === texto && s.avaliacaoIAPendente.texto === texto) {
      ultima.avaliacaoIA = s.avaliacaoIAPendente.avaliacao
      delete s.avaliacaoIAPendente
    }
  }

  function diaAnterior(diaISO) {
    const d = new Date(`${diaISO}T12:00:00`)
    d.setDate(d.getDate() - 1)
    return hojeISO(d)
  }

  function registrarHistorico(dia) {
    const p = carregar()
    let h = p.historico.find((x) => x.dia === dia)
    if (!h) {
      h = { dia, avaliacoes: 0, xp: 0 }
      p.historico.push(h)
      p.historico.sort((a, b) => (a.dia < b.dia ? -1 : 1))
      if (p.historico.length > 400) p.historico = p.historico.slice(-400)
    }
    h.avaliacoes += 1
    if (!Number.isFinite(h.xp)) h.xp = 0
    return h
  }

  function atualizarStreak(dia, avaliacoesHoje) {
    const p = carregar()
    const s = p.streak
    if (avaliacoesHoje < MIN_AVALIACOES_DIA) return s
    if (s.ultimoDia === dia) return s // já contou hoje
    if (s.ultimoDia === diaAnterior(dia)) s.atual += 1
    else s.atual = 1
    s.ultimoDia = dia
    if (s.atual > s.melhor) s.melhor = s.atual
    return s
  }

  /** streak "vivo": se o último dia contado foi antes de ontem, a ofensiva já caiu */
  function streakVisivel(dia = hojeISO()) {
    const p = carregar()
    const s = p.streak
    const ativo = s.ultimoDia === dia || s.ultimoDia === diaAnterior(dia)
    const hoje = p.historico.find((x) => x.dia === dia)
    return {
      atual: ativo ? s.atual : 0,
      melhor: s.melhor,
      ultimoDia: s.ultimoDia,
      hojeContou: s.ultimoDia === dia,
      avaliacoesHoje: hoje ? hoje.avaliacoes : 0,
      xpHoje: (p.xp && p.xp.porDia && p.xp.porDia[dia]) || 0,
      xpTotal: (p.xp && p.xp.total) || 0,
      minimoDia: MIN_AVALIACOES_DIA,
    }
  }

  return {
    obter() {
      const p = carregar()
      return { ...p, streak: streakVisivel() }
    },
    avaliar({ deckId, termoId, nota, modo, resposta }) {
      const p = carregar()
      const chave = `${deckId}/${termoId}`
      const agora = new Date()
      const dia = hojeISO(agora)
      p.termos[chave] = sm2Avaliar(p.termos[chave], nota, modo, resposta, agora)
      anexarPendenteNaResposta(p.termos[chave], modo, resposta)
      const h = registrarHistorico(dia)
      atualizarStreak(dia, h.avaliacoes)
      salvar()
      return { chave, termo: p.termos[chave], streak: streakVisivel(dia), hoje: h }
    },
    /**
     * Guarda a avaliação do mentor IA junto da resposta do modo Explique.
     * Se a resposta já foi gravada (mesmo texto), anexa em `avaliacaoIA` da entrada; senão fica em
     * `avaliacaoIAPendente` e é anexada quando a nota chegar via avaliar(). Não mexe no SM-2 nem na ofensiva.
     */
    anexarAvaliacaoIA({ deckId, termoId, resposta, avaliacao }) {
      const p = carregar()
      const chave = `${deckId}/${termoId}`
      const texto = String(resposta || '').trim().slice(0, 4000)
      const registro = { dia: hojeISO(), texto, avaliacao }
      const s = p.termos[chave] || (p.termos[chave] = { ...estadoInicial() })
      const lista = Array.isArray(s.respostasExplique) ? s.respostasExplique : (s.respostasExplique = [])
      const existente = [...lista].reverse().find((r) => r.texto === texto)
      if (existente) {
        existente.avaliacaoIA = avaliacao
        delete s.avaliacaoIAPendente
      } else {
        s.avaliacaoIAPendente = registro
      }
      salvar()
      return { chave, termo: s }
    },
    // ---- práticas (exercícios fora do app) ----------------------------------
    pratica(chave) {
      const p = carregar()
      return p.praticas[chave] || null
    },
    /** garante o registro e marca como "em andamento" (idempotente) */
    iniciarPratica(chave) {
      const p = carregar()
      const s = p.praticas[chave] || (p.praticas[chave] = praticaInicial())
      if (s.estado === 'nova') {
        s.estado = 'andamento'
        s.iniciadaEm = new Date().toISOString()
        salvar()
      }
      return s
    },
    rascunhoPratica(chave, texto) {
      const p = carregar()
      const s = p.praticas[chave] || (p.praticas[chave] = praticaInicial())
      if (s.estado === 'nova') {
        s.estado = 'andamento'
        s.iniciadaEm = new Date().toISOString()
      }
      s.rascunho = String(texto || '').slice(0, 20000)
      salvar()
      return s
    },
    tentativaErradaPratica(chave) {
      const p = carregar()
      const s = p.praticas[chave] || (p.praticas[chave] = praticaInicial())
      if (s.estado === 'nova') {
        s.estado = 'andamento'
        s.iniciadaEm = new Date().toISOString()
      }
      s.tentativasErradas += 1
      salvar()
      return s
    },
    dicaPratica(chave, n) {
      const p = carregar()
      const s = p.praticas[chave] || (p.praticas[chave] = praticaInicial())
      if (s.estado === 'nova') {
        s.estado = 'andamento'
        s.iniciadaEm = new Date().toISOString()
      }
      if (n > s.dicasUsadas) s.dicasUsadas = n
      salvar()
      return s
    },
    revelarPratica(chave) {
      const p = carregar()
      const s = p.praticas[chave] || (p.praticas[chave] = praticaInicial())
      if (s.estado === 'nova') {
        s.estado = 'andamento'
        s.iniciadaEm = new Date().toISOString()
      }
      if (s.estado !== 'concluida') s.revelou = true
      salvar()
      return s
    },
    /**
     * Conclui (ou re-conclui) um exercício com nota 0..5. A nota também vira uma avaliação SM-2 no termo
     * principal (modo "pratica"), então conta para nível, revisão e ofensiva.
     */
    concluirPratica({ chave, nota, auto, resposta, termoPrincipal }) {
      const p = carregar()
      const s = p.praticas[chave] || (p.praticas[chave] = praticaInicial())
      const agora = new Date()
      const dia = hojeISO(agora)
      nota = Math.max(0, Math.min(5, Math.round(Number(nota) || 0)))
      s.estado = 'concluida'
      s.concluidaEm = agora.toISOString()
      if (!s.iniciadaEm) s.iniciadaEm = s.concluidaEm
      s.ultimaNota = nota
      s.melhorNota = s.melhorNota == null ? nota : Math.max(s.melhorNota, nota)
      s.rascunho = ''
      s.historico = [...(s.historico || []).slice(-9), { dia, nota, auto: Boolean(auto), resposta: String(resposta ?? '').slice(0, 6000) }]
      let termo = null
      if (termoPrincipal) {
        const k = `${termoPrincipal.deckId}/${termoPrincipal.termoId}`
        p.termos[k] = sm2Avaliar(p.termos[k], nota, 'pratica', undefined, agora)
        termo = { chave: k, estado: p.termos[k] }
      }
      const h = registrarHistorico(dia)
      atualizarStreak(dia, h.avaliacoes)
      salvar()
      return { chave, pratica: s, termo, streak: streakVisivel(dia), hoje: h }
    },
    /** guarda a avaliação do mentor IA na última entrada do histórico (ou como pendente) */
    anexarAvaliacaoIAPratica({ chave, resposta, avaliacao }) {
      const p = carregar()
      const s = p.praticas[chave] || (p.praticas[chave] = praticaInicial())
      const texto = String(resposta || '').slice(0, 6000)
      const ultima = (s.historico || [])[s.historico.length - 1]
      if (ultima && ultima.resposta === texto) ultima.avaliacaoIA = avaliacao
      else s.avaliacaoIAPendente = { dia: hojeISO(), resposta: texto, avaliacao }
      salvar()
      return s
    },
    /** reabre um exercício concluído para tentar de novo (mantém histórico) */
    reabrirPratica(chave) {
      const p = carregar()
      const s = p.praticas[chave] || (p.praticas[chave] = praticaInicial())
      s.estado = 'andamento'
      s.iniciadaEm = new Date().toISOString()
      s.tentativasErradas = 0
      s.dicasUsadas = 0
      s.revelou = false
      salvar()
      return s
    },
    // ---- cursos (lições em Markdown) --------------------------------------
    curso(cursoId) {
      const p = carregar()
      return p.cursos[cursoId] || null
    },
    /** todos os cursos de uma vez (para a lista) */
    cursos() {
      return carregar().cursos
    },
    /** marca a lição como a última vista (continuar de onde parei). Não conclui nada. */
    verLicao(cursoId, licaoId, moduloId) {
      const p = carregar()
      const c = p.cursos[cursoId] || (p.cursos[cursoId] = cursoInicial())
      const agora = new Date().toISOString()
      if (!c.iniciadoEm) c.iniciadoEm = agora
      const l = c.licoes[licaoId] || (c.licoes[licaoId] = { vistaEm: null, concluidaEm: null })
      l.vistaEm = agora
      c.ultimaLicao = licaoId
      if (moduloId) c.ultimoModulo = moduloId
      c.atualizadoEm = agora
      salvar()
      return c
    },
    /** conclui (ou desmarca) uma lição. Lição não mexe no SM-2 nem na ofensiva - quem faz isso é a atividade. */
    concluirLicao(cursoId, licaoId, moduloId, concluida = true) {
      const p = carregar()
      const c = p.cursos[cursoId] || (p.cursos[cursoId] = cursoInicial())
      const agora = new Date().toISOString()
      if (!c.iniciadoEm) c.iniciadoEm = agora
      const l = c.licoes[licaoId] || (c.licoes[licaoId] = { vistaEm: agora, concluidaEm: null })
      l.concluidaEm = concluida ? agora : null
      if (!l.vistaEm) l.vistaEm = agora
      c.ultimaLicao = licaoId
      if (moduloId) c.ultimoModulo = moduloId
      c.atualizadoEm = agora
      salvar()
      return c
    },
    // ---- nós do caminho (lições da V2) -------------------------------------
    no(noId) {
      const p = carregar()
      return p.nos[noId] || null
    },
    /** todos os nós (a tela do módulo e o resolvedor da estrutura leem isto) */
    nos() {
      return carregar().nos
    },
    /**
     * Fecha um nó com o resultado da sessão. NÃO mexe na ofensiva: quem conta avaliação é avaliar()/
     * concluirPratica(), chamados item a item durante a lição. Aqui só entram XP, histórico e a marca
     * de concluído — senão uma lição de 10 itens contaria 11 avaliações e inflaria a ofensiva.
     */
    concluirNo({ noId, xp, acertos, total, itens }) {
      const p = carregar()
      const s = p.nos[noId] || (p.nos[noId] = noInicial())
      const agora = new Date()
      const dia = hojeISO(agora)
      const ganho = Math.max(0, Math.round(Number(xp) || 0))
      const primeiraVez = !s.concluidaEm
      s.concluidaEm = agora.toISOString()
      s.ultimoXp = ganho
      s.melhorXp = Math.max(s.melhorXp || 0, ganho)
      s.ultimoAcerto = total ? acertos / total : null
      s.historico = [...(s.historico || []).slice(-9), { dia, xp: ganho, acertos: Number(acertos) || 0, total: Number(total) || 0, itens: Array.isArray(itens) ? itens.slice(0, 40) : [] }]
      p.xp.total = (Number(p.xp.total) || 0) + ganho
      p.xp.porDia[dia] = (Number(p.xp.porDia[dia]) || 0) + ganho
      const h = p.historico.find((x) => x.dia === dia)
      if (h) h.xp = (Number(h.xp) || 0) + ganho
      salvar()
      return { noId, no: s, primeiraVez, xpDia: p.xp.porDia[dia], xpTotal: p.xp.total, streak: streakVisivel(dia) }
    },
    /** XP avulso (fora de um nó fechado): usado pelo chefão e pela entrevista simulada */
    somarXp(ganhoBruto) {
      const p = carregar()
      const dia = hojeISO()
      const ganho = Math.max(0, Math.round(Number(ganhoBruto) || 0))
      p.xp.total = (Number(p.xp.total) || 0) + ganho
      p.xp.porDia[dia] = (Number(p.xp.porDia[dia]) || 0) + ganho
      const h = p.historico.find((x) => x.dia === dia)
      if (h) h.xp = (Number(h.xp) || 0) + ganho
      salvar()
      return { xpDia: p.xp.porDia[dia], xpTotal: p.xp.total }
    },
    xpDoDia(dia = hojeISO()) {
      const p = carregar()
      return Number(p.xp.porDia[dia]) || 0
    },
    // ---- diário de erros ---------------------------------------------------
    diario({ moduloId } = {}) {
      const p = carregar()
      const lista = p.diario || []
      return moduloId ? lista.filter((e) => e.moduloId === moduloId) : lista
    },
    /** body: { moduloId, deckId, termoId, titulo, achei, era, detectar, origem } */
    anotarErro(entrada) {
      const p = carregar()
      const agora = new Date()
      const id = `e${agora.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
      const e = {
        id,
        dia: hojeISO(agora),
        criadoEm: agora.toISOString(),
        moduloId: String(entrada.moduloId || ''),
        deckId: String(entrada.deckId || ''),
        termoId: String(entrada.termoId || ''),
        titulo: String(entrada.titulo || '').slice(0, 200),
        achei: String(entrada.achei || '').slice(0, 2000),
        era: String(entrada.era || '').slice(0, 2000),
        detectar: String(entrada.detectar || '').slice(0, 2000),
        origem: String(entrada.origem || 'licao').slice(0, 32),
      }
      p.diario = [e, ...(p.diario || [])].slice(0, 500)
      salvar()
      return e
    },
    atualizarErro(id, campos) {
      const p = carregar()
      const e = (p.diario || []).find((x) => x.id === id)
      if (!e) return null
      for (const k of ['titulo', 'achei', 'era', 'detectar']) {
        if (typeof campos[k] === 'string') e[k] = campos[k].slice(0, 2000)
      }
      e.atualizadoEm = new Date().toISOString()
      salvar()
      return e
    },
    removerErro(id) {
      const p = carregar()
      const antes = (p.diario || []).length
      p.diario = (p.diario || []).filter((x) => x.id !== id)
      salvar()
      return { removido: p.diario.length < antes }
    },
    // ---- entrevistas simuladas ---------------------------------------------
    entrevista(moduloId) {
      const p = carregar()
      return p.entrevistas[moduloId] || null
    },
    salvarEntrevista(moduloId, sessao) {
      const p = carregar()
      const e = p.entrevistas[moduloId] || (p.entrevistas[moduloId] = { historico: [] })
      e.atual = sessao
      e.atualizadoEm = new Date().toISOString()
      salvar()
      return e
    },
    arquivarEntrevista(moduloId, sessao) {
      const p = carregar()
      const e = p.entrevistas[moduloId] || (p.entrevistas[moduloId] = { historico: [] })
      e.historico = [...(e.historico || []).slice(-9), { ...sessao, encerradaEm: new Date().toISOString() }]
      e.atual = null
      e.atualizadoEm = new Date().toISOString()
      salvar()
      return e
    },
    reset() {
      estado = progressoVazio()
      return salvar().then(() => estado)
    },
    aguardarEscrita() {
      return filaEscrita
    },
  }
}
