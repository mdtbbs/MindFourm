"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkipPhoneVerification = exports.SKIP_PHONE_VERIFICATION_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.SKIP_PHONE_VERIFICATION_KEY = 'skipPhoneVerification';
const SkipPhoneVerification = () => (0, common_1.SetMetadata)(exports.SKIP_PHONE_VERIFICATION_KEY, true);
exports.SkipPhoneVerification = SkipPhoneVerification;
//# sourceMappingURL=skip-phone-verification.decorator.js.map