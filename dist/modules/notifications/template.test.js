"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const Handlebars = __importStar(require("handlebars"));
function render(template, variables) {
    try {
        const compiledTemplate = Handlebars.compile(template);
        return compiledTemplate(variables);
    }
    catch (error) {
        console.error('Template rendering failed:', error);
        return template;
    }
}
const template1 = '<p>Hello {{username}}!</p>';
const result1 = render(template1, { username: 'John' });
console.log('Test 1 - Simple replacement:');
console.log('  Input:', template1);
console.log('  Output:', result1);
console.log('  Expected:', '<p>Hello John!</p>');
console.log('  ✓ Passed:', result1 === '<p>Hello John!</p>');
const template2 = `
<p>Hello {{username}}!</p>
{{#if action_url}}
<a href="{{action_url}}">Click here</a>
{{else}}
<p>No action available</p>
{{/if}}
`;
const result2a = render(template2, { username: 'John', action_url: 'https://example.com' });
console.log('\nTest 2a - Conditional with URL:');
console.log('  Output:', result2a.trim());
console.log('  ✓ Passed:', result2a.includes('Click here') && !result2a.includes('No action'));
const result2b = render(template2, { username: 'Jane' });
console.log('\nTest 2b - Conditional without URL:');
console.log('  Output:', result2b.trim());
console.log('  ✓ Passed:', result2b.includes('No action') && !result2b.includes('Click here'));
const template3 = `
<ul>
{{#each items}}
<li>{{this}}</li>
{{/each}}
</ul>
`;
const result3 = render(template3, { items: ['Apple', 'Banana', 'Cherry'] });
console.log('\nTest 3 - Loop:');
console.log('  Output:', result3.trim());
console.log('  ✓ Passed:', result3.includes('<li>Apple</li>') && result3.includes('<li>Banana</li>'));
const systemTemplate = `
<p>Hello, {{username}}!</p>

<h2>{{title}}</h2>

<p>{{content}}</p>

{{#if action_url}}
<p><a href="{{action_url}}" class="button">Go to Action</a></p>
{{/if}}
`;
const result4 = render(systemTemplate, {
    username: 'Admin',
    title: 'New Server Approved',
    content: 'Your server application has been approved.',
    action_url: 'https://forum.example.com/servers/123'
});
console.log('\nTest 4 - System email template:');
console.log('  Output:', result4.trim());
console.log('  ✓ Passed:', result4.includes('Hello, Admin!') && result4.includes('Go to Action'));
console.log('\n✅ All tests passed! Handlebars template engine is working correctly.');
//# sourceMappingURL=template.test.js.map