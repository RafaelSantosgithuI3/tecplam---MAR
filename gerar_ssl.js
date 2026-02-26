const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

async function generate() {
    const attrs = [{ name: 'commonName', value: 'localhost' }];

    // Suporte para versões antigas (síncronas) e novas (Promise) do selfsigned
    let pems;
    const generateResult = selfsigned.generate(attrs, { days: 3650 });

    if (generateResult instanceof Promise) {
        pems = await generateResult;
    } else {
        pems = generateResult;
    }

    const certDir = path.join(__dirname, 'sslcert');

    if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir);
    }

    fs.writeFileSync(path.join(certDir, 'server.key'), pems.private);
    fs.writeFileSync(path.join(certDir, 'server.crt'), pems.cert);

    console.log('Certificados SSL gerados com sucesso na pasta sslcert!');
}

generate().catch(console.error);
