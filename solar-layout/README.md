# SolarLayout

Editor 2D pra projetar a disposição de placas solares em telhados — feito pra rodar local, sem mensalidade de CAD.

## Como rodar (dentro do VS Code)

1. Abra a pasta `solar-layout` no VS Code.
2. Abra o terminal integrado (`Ctrl + \``).
3. Instale as dependências (só precisa fazer isso uma vez):
   ```
   npm install
   ```
4. Rode o projeto:
   ```
   npm run dev
   ```
5. Ele vai abrir sozinho no navegador em `http://localhost:5173`.

Toda vez que você editar o código e salvar, a página atualiza sozinha (hot reload).

## Como usar

1. **Carregar imagem** — suba uma foto ou print do Google Maps/satélite do telhado.
2. **Calibrar escala** — clique em 2 pontos sobre uma medida que você já sabe o valor real (ex: uma telha de 40cm, uma parede de 5m) e digite essa distância. Isso ensina o programa a converter pixels em metros.
3. **Desenhar contorno** — clique nos cantos do telhado (ou da área útil) pra marcar onde as placas podem ir. Clique perto do primeiro ponto pra fechar o desenho.
4. **Configurar módulo** — escolha orientação (retrato/paisagem), potência da placa (Wp), afastamento de borda e espaçamento entre placas.
5. **Preencher automaticamente** — clica em "Preencher telhado automaticamente" e ele encaixa quantas placas couberem dentro do contorno, respeitando os afastamentos.
6. Pode arrastar, girar (`R`) ou remover (`Del`) qualquer placa manualmente depois.
7. **Exportar PNG** — gera uma imagem do layout final pra levar pro cliente ou anexar no projeto.

## O que ele NÃO faz (ainda)

- Não calcula sombreamento/irradiação solar (isso exigiria modelagem 3D + dados de posição do sol).
- Não gera memorial técnico, ART ou lista de materiais.
- Não exporta pra DWG/DXF (só PNG por enquanto).

Se precisar de algum desses depois, dá pra evoluir em cima dessa base — o código já está organizado pra isso (a lógica de geometria fica separada da interface, em `src/App.jsx`).

## Estrutura do projeto

```
solar-layout/
├── index.html          # HTML raiz
├── package.json        # dependências
├── vite.config.js       # config do bundler
└── src/
    ├── main.jsx          # ponto de entrada React
    ├── App.jsx           # toda a lógica do editor (canvas, painéis, cálculos)
    └── index.css         # estilo visual (tema "blueprint")
```

## Stack usada

- **React** — interface
- **Konva.js / react-konva** — canvas de desenho (arrastar, girar, camadas)
- **Vite** — bundler rápido pra desenvolvimento
