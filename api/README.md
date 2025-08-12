# FlowLedger API

This directory contains the backend API for FlowLedger, built with Node.js and Express.

## Prerequisites

- Node.js (v20.x or later)
- Access to the Azure SQL database

## Local Development

1.  **Navigate to the API directory:**
    ```bash
    cd api
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the `api` directory and add the following variables.

    ### Authentication Modes (`SQL_AUTH`)

    The API supports multiple database authentication methods, configured via the `SQL_AUTH` environment variable.

    #### 1. SQL Authentication (Default)
    Uses a traditional SQL username and password.

    ```dotenv
    # .env
    SQL_SERVER="your-server.database.windows.net"
    SQL_DATABASE="your-database-name"
    SQL_AUTH="sql"
    SQL_USER="your-sql-username"
    SQL_PASSWORD="your-sql-password"
    PORT=4000
    ```

    #### 2. Azure AD - Managed Identity
    Uses the Managed Identity of the deployed Azure service (like an App Service or Function App) to authenticate. This is the recommended method for production environments.

    ```dotenv
    # .env
    SQL_SERVER="your-server.database.windows.net"
    SQL_DATABASE="your-database-name"
    SQL_AUTH="aad-msi"
    PORT=4000
    ```

    #### 3. Azure AD - Default Credential
    Uses the `@azure/identity` `DefaultAzureCredential` flow. This is useful for local development when you are logged into Azure via the Azure CLI or other methods.

    ```dotenv
    # .env
    SQL_SERVER="your-server.database.windows.net"
    SQL_DATABASE="your-database-name"
    SQL_AUTH="aad-default"
    PORT=4000
    ```

4.  **Run the server:**
    ```bash
    npm start
    ```
    The API will be available at `http://localhost:4000`. The console will log the active authentication mode on startup.

## Deployment

This API is configured for continuous deployment to an Azure Function App. Deployments are automatically triggered from the `main` branch using the Azure Deployment Center.
