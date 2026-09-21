import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';

import { Public } from './common/decorators/public.decorator';



@Controller()
  
export class AppController {
  
  constructor(private readonly appService: AppService) {}
  

  
  @Get('health')
  
  @Public()
  
  getHealth(): { status: 'ok'; service: string } {
    
    return { status: 'ok', service: 'backend' };
    
  }
  

  
  @Get()
  
  getHello(): string {
    
    return this.appService.getHello();
    
  }
  
}















