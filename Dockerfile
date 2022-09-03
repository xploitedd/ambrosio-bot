FROM node:18 as builder

RUN npm i -g --force yarn && yarn global add typescript

COPY ./package.json ./tsconfig.json ./

RUN yarn install --prod --no-lockfile

COPY ./src ./src

RUN tsc

FROM node:18-slim as runner

RUN apt update && apt install -y ffmpeg

WORKDIR /app

COPY --from=builder ./package.json ./package.json
COPY --from=builder ./node_modules ./node_modules
COPY --from=builder ./dist ./dist

CMD ["yarn", "run", "start:prod"]