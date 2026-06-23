export declare const appConfig: () => {
    app: {
        port: number;
        env: string;
        frontendUrl: string;
        apiUrl: string;
    };
    mysql: {
        host: string;
        port: number;
        user: string;
        password: string;
        database: string;
    };
    redis: {
        host: string;
        port: number;
        password: string | undefined;
        db: number;
    };
    mindauth: {
        baseUrl: string;
        clientId: string;
        clientSecret: string;
        callbackUrl: string;
        serviceKey: string;
    };
    easymanager: {
        baseUrl: string;
        apiKey: string;
    };
    automation: {
        apiKey: string;
    };
    session: {
        maxAge: number;
    };
};
