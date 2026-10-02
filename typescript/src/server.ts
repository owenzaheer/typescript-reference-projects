import 'reflect-metadata';
import { Body, Controller, Get, Post, Headers, Header, Module, HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Engine, Problem } from './engine';
const path=resolve(process.argv[2]||'ecommerce-fulfillment-and-component-portal-typescript/project.json');
const config=JSON.parse(readFileSync(path,'utf8'));const engine=new Engine();
@Controller()
class WorkflowController {
 @Get('/api/config') config(){return config;}
 @Get('/api/health') health(){return {status:'ok',project:config.id,storage:'in-memory synthetic fixture'};}
 @Get('/api/state') state(@Headers('authorization') auth:string){if(auth!=='Bearer local-operator')throw new HttpException('Operator required',403);return engine.state();}
 @Post('/api/action') action(@Body() body:unknown,@Headers('authorization') auth:string){
  const role:Record<string,string>={'Bearer local-learner':'learner','Bearer local-operator':'operator','Bearer local-reviewer':'reviewer','Bearer local-instructor':'instructor'};if(!role[auth])throw new HttpException('Explicit local fixture role token required',401);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpException('Command object required',422);const {action,payload}=body as Record<string,unknown>;
  if(typeof action!=='string'||!config.actions.includes(action))throw new HttpException('Action unavailable in this project',404);
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new HttpException('Object payload required',422);
  try{return engine.command(action,payload as Record<string,unknown>,role[auth]);}catch(e){if(e instanceof Problem)throw new HttpException(e.message,e.status);throw e;}
 }
 @Get('/') @Header('Content-Type','text/html') page(){return readFileSync(resolve('../ui/console.html'),'utf8').replace('__CONFIG__',JSON.stringify(config));}
}
@Module({controllers:[WorkflowController]})class DemoModule{}
async function main(){const app=await NestFactory.create(DemoModule,{bodyParser:true});await app.listen(Number(process.env.PORT||8000),'127.0.0.1');}
main();
