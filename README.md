# SolarLayout

Editor 2D para projetar a disposição de módulos fotovoltaicos em telhados e lajes, a partir de uma foto de satélite.

## Como ligar

**Jeito fácil (Windows):** dê dois cliques em `INICIAR.bat`.
Ele instala o que faltar (só na primeira vez) e abre o programa no navegador em `http://localhost:5173`.

**Pelo terminal (VS Code):**

```
npm install      ← só na primeira vez (ou se der erro de módulo faltando)
npm run dev      ← liga o programa
```

Para parar: `Ctrl + C` no terminal. Precisa do [Node.js](https://nodejs.org) instalado (versão 18 ou mais nova).

Outros comandos: `npm test` (testes dos cálculos) · `npm run build` (gera a versão final em `dist/`).

## Como usar

1. **Imagem** — carregue (ou cole com `Ctrl+V`) um print de satélite, de cima, com o telhado visível.
2. **Escala** — clique em 2 pontos de uma medida que você conhece e digite a distância real. *Isso é o que mais influencia a precisão de tudo.* Use a maior medida possível.
3. **Contorno** — clique nos cantos da área útil. Feche clicando no 1º ponto ou com `Enter`. Depois pode arrastar os cantos. As medidas dos lados aparecem na tela — confira com o que você sabe do telhado.
4. **Obstáculos** — marque chaminé, caixa d'água, claraboia etc. O preenchimento desvia deles.
5. **Tipo de cobertura**
   - *Telhado inclinado*: módulos rente ao telhado. Informe a inclinação — a foto mostra o telhado "achatado", então o módulo ocupa menos na foto (`medida × cos(inclinação)`). O programa corrige isso.
   - *Laje / plano*: módulos em estrutura inclinada. Informe inclinação, latitude e o programa calcula o espaçamento entre fileiras para uma fileira não fazer sombra na outra.
6. **Módulo** — escolha um modelo ou digite as medidas do datasheet.
7. **Preencher automaticamente** — testa retrato e paisagem e várias posições da grade e fica com a que couber mais. Depois ajuste na mão: arrastar, `R` gira, `Del` remove, setas movem 5 cm.
8. **Exportar PNG** — imagem na resolução original, com legenda (nº de módulos, kWp, escala).

Módulos que ficam **vermelhos** estão fora do contorno, sobrepostos ou em cima de obstáculo.

## O que mudou nesta versão

Correções:
- `Backspace` dentro de um campo apagava o módulo selecionado.
- Girar um módulo não atualizava o desenho das células.
- Não dava para clicar sobre módulos já colocados ao desenhar contorno/obstáculo.
- Recalibrar a escala fazia os módulos sumirem/desalinharem; agora a escala antiga fica até você confirmar a nova (e os módulos são limpos com aviso, com `Ctrl+Z` para voltar).
- Rodar o preenchimento duas vezes empilhava módulos um sobre o outro (agora substitui).
- O afastamento da borda só valia para a caixa que envolve o telhado; agora vale para cada lado do contorno (inclusive em formato de L).
- A área do canvas não acompanhava o tamanho da janela, e imagens grandes não cabiam (sem zoom).
- Vírgula decimal (`0,5`) agora funciona em todos os campos.

Novidades: zoom e arrastar o mapa, desfazer (`Ctrl+Z`), medidas dos lados, barra de escala, obstáculos, alinhamento automático com o lado mais longo do telhado (telhados "tortos" na foto), correção por inclinação do telhado, espaçamento entre fileiras em laje, modelos de módulo, alerta de módulo inválido, estimativa de geração, corredor livre opcional.

## De onde vêm os números (e o que NÃO é garantido)

- **Módulos**: 550/555 W = 2278 × 1134 mm (datasheets Intelbras EMSH-550M-HC e RENO-C 555); 700 W = 2384 × 1303 mm (Trina Vertex N, TSM-700NEG21C.20); 415 W ≈ 1722 × 1134 mm (varia 1722–1726 conforme fabricante). **Sempre confirme no datasheet do seu módulo.**
- **Espaçamento entre fileiras**: `P = L·cosβ + sombra`, com a sombra calculada para o solstício de inverno do hemisfério (Sol mais baixo do ano). O modo "meio-dia" reproduz a fórmula clássica (`α = 90° − |lat − δ|`; exemplo publicado de 50°N, 30°, módulo de 1,134 m dá 2,89 m — o teste automático confere). O modo "9h–15h" (padrão) usa o pior caso entre 9h, 12h e 15h solares. É um critério geométrico de um dia; não substitui simulação (PVsyst etc.).
- **Afastamentos de borda**: não achei um valor nacional único para telhados. O padrão do programa é 0,5 m (conservador e comum na prática de instaladores); ajuste conforme norma local, fabricante da estrutura e o cálculo de vento. O RTCBMRS 23/2025 (RS) cita, por exemplo, ≥ 18 cm entre módulos e telhado para dissipar calor e vão livre de 2 m a cada 16 m de módulos; outros estados têm regras próprias. Confirme no corpo de bombeiros do seu estado e na ABNT NBR 16690.
- **Estimativa de geração**: `kWp × HSP × 30 × PR` — conta de bolso. Use a HSP da sua cidade (Atlas Brasileiro / CRESESB).
- O programa **não** faz: projeto elétrico (strings, inversor, cabos), cálculo estrutural/vento, sombreamento de obstáculos/árvores/prédios vizinhos, memorial técnico ou ART.

## Estrutura

```
solar-layout/
├── INICIAR.bat           # liga tudo com dois cliques (Windows)
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx          # entrada React
│   ├── App.jsx           # interface (canvas, painéis, estados)
│   ├── solar.js          # cálculos puros: geometria, sol, preenchimento
│   └── index.css         # tema "blueprint"
└── test/solar.test.mjs   # testes dos cálculos (npm test)
```

## Stack

React · Konva / react-konva (canvas) · Vite
