# RoutineX

Sistema pessoal de rotina, tarefas e calendário, com contas e níveis de acesso.
HTML5, CSS3 e JavaScript ES6+ puro — sem frameworks, sem build, sem dependências.

## Como abrir

O projeto usa módulos ES (`<script type="module">`), e navegadores bloqueiam
módulos abertos por `file://`. Rode um servidor local — qualquer um serve:

```bash
# Python (já vem instalado no macOS e na maioria das distros Linux)
python3 -m http.server 8000

# ou Node
npx serve .
```

Depois abra `http://localhost:8000`.

> Abrir o `index.html` com duplo clique não funciona: os módulos não carregam,
> o `localStorage` fica indisponível em algumas origens `file://` e a Web Crypto
> (usada no hash das senhas) exige `https` ou `localhost`.

No primeiro acesso o app pede o cadastro da primeira conta, que nasce
**administradora**.

## Mapa do projeto

```
routinex/
├── index.html              Dashboard
├── pages/                  Demais telas (mesma casca, conteúdo próprio)
│   ├── login.html          Entrar / criar conta (única tela sem sessão)
│   ├── profile.html        Perfil do usuário
│   ├── users.html          Gestão de contas (só admin)
│   └── …
├── css/
│   ├── global.css          Tokens de design, reset, componentes base
│   ├── layout.css          Casca: sidebar, topbar, barra inferior, drawer
│   ├── components.css      Peças usadas por várias telas
│   ├── login.css           …e um arquivo por tela
│   └── responsive.css      Sempre por último
├── js/
│   ├── app.js              Sessão, guarda de rota e boot de cada tela
│   ├── storage.js          Única porta de acesso ao localStorage
│   ├── auth/               Contas, senhas, validações e permissões
│   ├── core/schedule.js    Rotinas + atividades → ocorrências
│   ├── features/           Formulários e fluxos (atividade, tarefa, rotina…)
│   ├── pages/              Um módulo por tela, carregado sob demanda
│   └── ui/                 Casca, campos, modal, ícones, toasts
└── assets/
    └── images/             logo.png (marca) e Fundo.png (fundo da entrada)
```

## Imagens da marca

| Arquivo | Onde aparece |
| --- | --- |
| `assets/images/logo.png` | Marca completa, escrita escura — usada no **tema claro** |
| `assets/images/logo-dark.png` | Mesma marca com a escrita branca — usada no **tema escuro** |
| `assets/images/LogoNav.png` | Ícone da aba do navegador (favicon) e do atalho no celular |
| `assets/images/Fundo.png` | Fundo das telas de login e cadastro, com um véu escuro por cima |

A marca troca sozinha conforme o tema: `brandMark` (em `js/ui/shell.js`) lê
`<html data-theme>` e observa mudanças, então alternar o tema troca o arquivo na
hora, sem recarregar a página. O X azul é o mesmo nas duas versões — só a
palavra muda de cor.

### Gerando a versão de tema escuro

Quando a logo mudar, a variante de escrita branca se refaz a partir do arquivo
novo: os pixels **escuros** (luminância abaixo de 120) viram branco puro e os
**claros** — o X — ficam intocados, com a transparência preservada. O corte
funciona porque as duas partes não se encontram: nesta arte a escrita vai até
~60 de luminância e o X começa em 142.

O topo da sidebar tem só a logo — sem nome, sem assinatura ao lado.

## Contas e níveis de acesso

Cada conta guarda nome, e-mail, senha, CPF e telefone (CPF validado por dígito
verificador, telefone com DDD). A senha nunca é gravada: fica só o hash
**PBKDF2-SHA256** com sal próprio, 150 mil iterações.

| Nível | O que pode |
| --- | --- |
| **Administrador** | Tudo, mais a gestão de contas e níveis em `pages/users.html` |
| **Membro** | Cria e edita livremente a própria agenda |
| **Visitante** | Só consulta: não cria, não edita, não apaga |

A primeira conta criada vira administradora. Um administrador não altera o
próprio nível, e o sistema nunca fica sem nenhum administrador.

### Aviso de segurança

Isto é autenticação **local**, do lado do navegador. Ela separa contas e evita
acesso casual, mas quem tem o aparelho e o DevTools em mãos consegue ler e
alterar o `localStorage` — inclusive para se promover a administrador. Para
segurança real, a verificação precisa acontecer em um servidor. O código foi
desenhado para essa migração: só `js/auth/accounts.js` conhece o formato de
armazenamento, e todos os métodos que um dia falarão com a rede já são
assíncronos.

## Vários usuários

Os dados de cada conta vivem em uma chave própria: `routinex:v2:u:<id do usuário>`.
Trocar de conta troca a agenda inteira, sem vazamento entre elas. Quem já usava
a versão anterior (chave `lp:v1`) tem a agenda migrada automaticamente para a
primeira conta criada, e as chaves do nome anterior (`nexora:v2:*`) são adotadas
no primeiro carregamento — trocar o nome do produto não apaga dado de ninguém.

O `store` aponta para uma conta por vez (`store.use(userId)`), e recusa qualquer
escrita de quem não tem permissão — a interface avisa antes, o storage garante
depois.

## Telas

| Tela | O que faz |
| --- | --- |
| Dashboard | Atividade atual, próxima, progresso do dia e tarefas em aberto |
| Hoje | Agenda completa de um dia, com navegação entre os dias |
| Calendário | Mês, semana e dia; criar clicando no horário |
| Tarefas | Lista agrupada por prazo, com filtros e contagem |
| Rotinas | Cartões do que se repete, com pausar, editar e excluir |
| Estatísticas | Conclusão por período, gráfico diário, tempo por categoria e sequências |
| Configurações | Nome, tema, início da semana, notificações, categorias e backup |
| Perfil | Dados cadastrais, troca de senha, nível de acesso e exclusão da conta |
| Usuários | Contas, níveis e busca — só para administradores |

## Cor do sistema

O acento é azul claro e sai de cinco variáveis em `css/global.css`
(`--accent`, `--accent-dark`, `--accent-ink`, `--accent-soft`, `--accent-line`,
mais `--accent-rgb` para os degradês). Mudar esses valores muda a cor do sistema
inteiro — há um conjunto para o tema escuro e outro para o claro. As cores de
categoria são dados do usuário e seguem em paletas próprias.

## Convenções

- **Datas** são strings `YYYY-MM-DD` no fuso local. Nunca `new Date("2026-08-10")`,
  que o JavaScript lê como UTC e pode voltar um dia.
- **Horários** são strings `HH:MM`. Comparações acontecem em minutos (`timeToMinutes`).
- **Persistência** só acontece por `store.*`. Nenhum outro arquivo toca em `localStorage`
  (a exceção é o script de tema no `<head>`, que evita o flash de tela clara).
- **Mudanças de dados** avisam a interface por `store.on("change", fn)`.
- **Rotinas** não gravam atividades. O `core/schedule.js` as expande em ocorrências
  na hora de desenhar cada dia; editar ou apagar um dia isolado materializa só aquele dia.
- **Permissão** se pergunta em um lugar só: `can(user, "data:write")`, de `js/auth/permissions.js`.

## Mobile first

O CSS base é a versão de celular: uma coluna, sidebar como gaveta, navegação na
barra inferior ao alcance do polegar e modais em folha deslizante. As telas
maiores entram por `min-width` em `responsive.css` — 600, 900, 1024 e 1180px.
Nenhum `max-width` desfazendo estilo. Alvos de toque têm no mínimo 44px e o
rodapé respeita a área segura (`env(safe-area-inset-bottom)`).

## Atalhos

| Tecla | Ação |
| --- | --- |
| `N` | Nova atividade |
| `T` | Ir para Hoje |
| `C` | Abrir o calendário |
| `/` ou `Ctrl`/`⌘` + `K` | Abrir a busca global |
| `Esc` | Fechar modal, busca ou menu |

Os atalhos ficam inativos enquanto você digita em um campo ou com um modal aberto.

Nas telas **Hoje** e **Calendário**, "Nova atividade" já nasce no dia que está na
tela — não no dia de hoje.
