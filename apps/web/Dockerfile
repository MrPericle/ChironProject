FROM node:20-alpine AS base

WORKDIR /app

COPY package.json ./

FROM base AS development

RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]

FROM base AS build

RUN npm install

COPY . .

RUN npm run build

FROM nginx:1.27-alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

