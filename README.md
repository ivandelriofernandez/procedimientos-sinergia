# Sinergia FP - IT Procedures Hub

Webapp estática con HTML, CSS y JavaScript modular para centralizar procedimientos del departamento de IT.

## Stack
- Frontend: HTML + CSS + JavaScript modular
- Auth: Firebase Authentication
- Base de datos: Cloud Firestore
- Ficheros: Firebase Storage
- Hosting: Vercel
- Control de versiones: GitHub
- Edición local: Visual Studio Code

## Estructura
```text
sinergia-it-procedimientos/
├── index.html
├── app.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── auth.js
│   ├── firebase-config.js
│   ├── firestore.js
│   ├── login.js
│   └── ui.js
├── data/
│   └── seed-procedures.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── vercel.json
├── .gitignore
└── README.md
```

## Configuración de Firebase
1. Crea un proyecto en Firebase.
2. Activa Authentication con Email/Password y Google.
3. Crea Firestore en modo producción.
4. Activa Firebase Storage.
5. En **Project settings > Your apps > Web app**, copia la configuración.
6. Pega esos valores en `js/firebase-config.js`.
7. Añade tu dominio de Vercel en **Authentication > Settings > Authorized domains**.

## Despliegue de reglas
Instala Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase init storage
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Publicación en GitHub
```bash
git init
git add .
git commit -m "Initial Sinergia FP IT Hub"
git branch -M main
git remote add origin https://github.com/ivandelriofernandez/sinergia-it-procedimientos.git
git push -u origin main
```

## Publicación en Vercel
### Opción A: desde GitHub
1. Entra en Vercel.
2. Importa el repositorio `sinergia-it-procedimientos`.
3. Framework Preset: `Other`.
4. Root Directory: `/`.
5. Deploy.

### Opción B: con CLI
```bash
npm install -g vercel
vercel
```

## Mejoras siguientes
- Roles por usuario (admin, soporte, lectura)
- Histórico de cambios
- Buscador avanzado por etiquetas
- Procedimientos con versión y aprobación
- Panel de métricas y auditoría
