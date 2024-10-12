Data dir:

```
Dir chứa log là = /logs
Dir chứa dữ liệu upload = /publish
```

Node version:

```
required: node version 10+
```

Install it and run:

```
bash
npm install
npm run dev
# or
yarn
yarn dev
```

Build production and run:

```
npm run start
port: 8080
```

pm2 start ecosystem.config.js --env production

Docker
sudo docker build -t.
sudo docker run -i -d --rm --init -e NODE_ENV=production --log-driver local --net=host

docker container logs
