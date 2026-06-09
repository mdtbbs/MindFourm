"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailQueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailQueueService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const email_service_1 = require("./email.service");
const redis_service_1 = require("../../database/redis.service");
let EmailQueueService = EmailQueueService_1 = class EmailQueueService {
    constructor(emailService, redisService) {
        this.emailService = emailService;
        this.redisService = redisService;
        this.logger = new common_1.Logger(EmailQueueService_1.name);
    }
    async onModuleInit() {
        const redisConfig = this.redisService.getConnectionConfig();
        this.queue = new bullmq_1.Queue('email-queue', {
            connection: redisConfig,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 100,
                removeOnFail: 50,
            },
        });
        this.worker = new bullmq_1.Worker('email-queue', async (job) => {
            const { to, subject, html, text } = job.data;
            await this.emailService.sendMail({ to, subject, html, text });
        }, {
            connection: redisConfig,
            concurrency: 5,
        });
        this.worker.on('completed', (job) => {
            this.logger.debug(`Email sent: ${job.data.subject} -> ${job.data.to}`);
        });
        this.worker.on('failed', (job, err) => {
            this.logger.error(`Email failed: ${job?.data?.subject} -> ${job?.data?.to}: ${err.message}`);
        });
        this.logger.log('Email queue initialized with BullMQ');
    }
    async onModuleDestroy() {
        await this.queue.close();
        await this.worker.close();
    }
    async addEmailJob(job) {
        await this.queue.add('send-email', job);
    }
    async getQueueSize() {
        const jobs = await this.queue.getJobCounts('waiting', 'active');
        return jobs.waiting + jobs.active;
    }
};
exports.EmailQueueService = EmailQueueService;
exports.EmailQueueService = EmailQueueService = EmailQueueService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [email_service_1.EmailService,
        redis_service_1.RedisService])
], EmailQueueService);
//# sourceMappingURL=email-queue.service.js.map