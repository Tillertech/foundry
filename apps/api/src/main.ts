import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useWebSocketAdapter(new IoAdapter(app));
  const globalPrefix = 'api/v1';
  app.setGlobalPrefix(globalPrefix);

  if (process.env.NODE_ENV === 'development') {
    app.enableCors({
      origin: '*',
      credentials: true,
    });

    const config = new DocumentBuilder()
      .setTitle('Foundry')
      .setDescription('The Foundry API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, documentFactory);
  }
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
