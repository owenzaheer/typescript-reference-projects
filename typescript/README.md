# TypeScript / NestJS demos

Node 22+ and pnpm. From this folder: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, then `pnpm start ecommerce-fulfillment-and-component-portal-typescript/project.json`. Substitute either finance or education project folder. Open `http://127.0.0.1:8000` for the console. `PORT` changes the port.

For the React interface: start the API, then from `../frontends/react` run `pnpm install --frozen-lockfile` and `pnpm dev`. Vite proxies `/api` to this local API. The same interface supports all three configurations, with typed controls, role selection, request feedback and audit views.

Implemented: TypeScript, NestJS, runtime boundary validation, native HMAC signatures, synchronous in-memory transactions, outbox fixture retries, approval permissions and version conflicts. Node tests cover failure behavior and simultaneous request attempts. PostgreSQL/Prisma, Redis, MongoDB, Apollo/GraphQL and Kafka are not configured in these local demo versions. All tokens are explicitly local role fixtures. Restart resets data.

Signed callback example from this folder: `pnpm exec tsx -e "const {Engine}=require('./src/engine'); const p={id:'p',invoice:'INV-100',amount:10000}; console.log(JSON.stringify({...p,signature:new Engine().signature(p)}))"`.
