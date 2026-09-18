// Um ícone por módulo, escolhido pelo campo `icone` de content/estrutura.json.
// Nome desconhecido cai no genérico — módulo novo nunca fica sem ícone.
const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

const FORMAS = {
  node: (
    <>
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" />
      <path d="M12 12v9" />
      <path d="m4 7.5 8 4.5 8-4.5" />
    </>
  ),
  rede: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </>
  ),
  banco: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  olho: (
    <>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  raio: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  fila: (
    <>
      <rect x="2" y="9" width="5" height="6" rx="1" />
      <rect x="9.5" y="9" width="5" height="6" rx="1" />
      <rect x="17" y="9" width="5" height="6" rx="1" />
    </>
  ),
  escudo: (
    <>
      <path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  nos: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="18" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M12 7.2 6.2 15.8M12 7.2l5.8 8.6M7.2 18h9.6" />
    </>
  ),
  blocos: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>
  ),
  planta: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M11 10v10M15 4v6" />
    </>
  ),
  checar: (
    <>
      <path d="M9 3h6l1 3H8z" />
      <rect x="4" y="6" width="16" height="15" rx="2" />
      <path d="m8.5 13 2.5 2.5 4.5-5" />
    </>
  ),
  caixa: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  cadeado: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  pessoas: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M16 6.5a3 3 0 0 1 0 5.8M17 15.4c2.4.5 4 2 4 4.6" />
    </>
  ),
  arvore: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <circle cx="6" cy="19.5" r="2" />
      <circle cx="18" cy="19.5" r="2" />
      <path d="M12 6.5v4M12 10.5H6v7M12 10.5h6v7" />
    </>
  ),
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
    </>
  ),
  idioma: (
    <>
      <path d="M3 6h9M7.5 4v2M10 6c0 4-3 8-7 9" />
      <path d="M5 11c1.6 2.4 3.6 4 6 5" />
      <path d="m13 21 4-11 4 11M14.4 17.5h5.2" />
    </>
  ),
  generico: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 2" />
    </>
  ),
}

export default function IconeModulo({ nome, ...props }) {
  return <svg {...base} {...props}>{FORMAS[nome] || FORMAS.generico}</svg>
}
