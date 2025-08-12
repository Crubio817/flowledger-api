declare module 'swagger-ui-express' {
  import { RequestHandler } from 'express';
  const serve: RequestHandler[];
  const setup: (doc: any, options?: any, customCss?: string, customfavIcon?: string, swaggerUrl?: string, customSiteTitle?: string) => RequestHandler;
  export default { serve, setup } as any;
  export { serve, setup };
}
