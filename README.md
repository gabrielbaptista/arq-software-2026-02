# arq-software-2026-02

Aplicativo Expo (React Native) com autenticação local e cadastro de produtos usando SQLite.

## Funcionalidades

- Login com e-mail e senha.
- Criação de conta com código de recuperação.
- Redefinição de senha com validação do código de recuperação.
- Armazenamento seguro de senha e código de recuperação com hash (PBKDF2 + SHA-256 e salt).
- Cadastro de produtos com nome, descrição e validade.
- Listagem de produtos cadastrados ordenada por validade.
- Persistência de dados local com SQLite.

## Tecnologias

- React Native
- Expo
- expo-sqlite
- @noble/hashes

## Como executar

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Inicie o projeto:

   ```bash
   npm start
   ```
