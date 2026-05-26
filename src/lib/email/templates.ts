function layout(content: string) {
  return `
    <div style="
      background:#050816;
      padding:40px 20px;
      font-family:Arial,sans-serif;
      color:white;
    ">
      <div style="
        max-width:620px;
        margin:auto;
        background:#0b1020;
        border-radius:28px;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.08);
      ">

        <div style="
          padding:32px;
          text-align:center;
          background:linear-gradient(135deg,#111827,#1e1b4b);
        ">
          <h1 style="
            margin:0;
            font-size:34px;
          ">
            Harmomus
          </h1>

          <p style="
            color:#cbd5e1;
            margin-top:12px;
          ">
            Prepare sua voz. Honre seu chamado.
          </p>
        </div>

        <div style="
          padding:36px;
          line-height:1.8;
          color:#e5e7eb;
        ">
          ${content}
        </div>

        <div style="
          padding:24px;
          text-align:center;
          color:#94a3b8;
          border-top:1px solid rgba(255,255,255,.08);
          font-size:13px;
        ">
          © Harmomus
        </div>

      </div>
    </div>
  `;
}

export function welcomeTemplate(name?: string) {
  return layout(`
    <h2 style="font-size:30px;color:white;">
      Bem-vindo ao Harmomus 🎵
    </h2>

    <p>
      Olá ${name || ""}, sua conta foi criada com sucesso.
    </p>

    <p>
      Agora você já pode acessar seus kits vocais,
      estudar divisões e evoluir sua percepção musical.
    </p>

    <div style="margin-top:36px;text-align:center;">
      <a
        href="https://harmomus.com/biblioteca"
        style="
          display:inline-block;
          background:#22d3ee;
          color:#020617;
          padding:14px 28px;
          border-radius:16px;
          text-decoration:none;
          font-weight:bold;
        "
      >
        Acessar Harmomus
      </a>
    </div>
  `);
}
