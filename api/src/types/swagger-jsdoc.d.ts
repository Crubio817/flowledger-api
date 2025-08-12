declare module 'swagger-jsdoc' {
  export interface Options {
    definition: any;
    apis: string[];
  }
  const swaggerJSDoc: (options: Options) => any;
  export default swaggerJSDoc;
}
