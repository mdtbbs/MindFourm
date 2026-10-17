import { Metadata } from 'next';
import Link from 'next/link';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import ClubLegalDocument from '@/components/forum/club-legal-document';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { getServerSiteName } from '@/lib/settings/server';
import { translate } from '@/i18n';

const DESCRIPTION = '本站的数据收集、使用与保护说明';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const club = siteProfile.profile === 'mindustry-club';
  const title = club ? translate(locale, 'legal.privacy.title') : '隐私政策';
  const description = club ? title : DESCRIPTION;
  return {
    title,
    description,
    alternates: { canonical: '/privacy' },
    openGraph: {
      title,
      description,
      type: 'website',
      url: '/privacy',
    },
  };
}

function MdtbbsPrivacyFallback() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold">我们处理哪些信息</h2>
        <p className="mt-2">
          为提供登录、社区内容、通知、审核和安全风控等功能，像素工厂中文论坛（MDTBBS）
          会处理必要的账户资料、社区资料、用户发布内容、互动记录以及登录和安全相关数据。
          安全相关数据可能包括 IP 地址、User-Agent、会话信息和必要的安全日志。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">手机号安全验证</h2>
        <p className="mt-2">
          MDTBBS 国内站使用中国大陆手机号 + 短信验证码完成手机号安全验证。
          手机号由账号认证服务用于发送和校验验证码、账号安全及必要的安全风控；
          论坛侧会同步手机号验证状态，以判断相关社区写操作是否可以使用。
        </p>
        <p className="mt-2">
          手机号不会显示在个人主页、帖子、回复或其他社区公开页面，
          也不会用于与安全验证目的无关的广告营销。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">为什么需要验证</h2>
        <p className="mt-2">
          MDTBBS 提供主题发布、回复、资源提交等用户信息发布与互动服务。
          根据相关法律法规，此类服务需要对相关用户进行真实身份信息认证。
          手机号属于相关规定允许采用的认证方式之一。为了尽量减少需要收集的信息，
          MDTBBS 当前使用短信验证完成安全校验，无需一般用户额外提交身份证件等信息。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">信息使用与保存</h2>
        <p className="mt-2">
          我们仅在提供相关服务、维护账号和社区安全、处理争议以及履行法定义务所必要的范围内使用个人信息。
          除法律、行政法规另有规定外，个人信息的保存期限以实现处理目的所必要的最短时间为原则。
          对依法需要留存的安全日志等数据，按照适用的法律法规和实际安全需要处理。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">公开内容与第三方访问</h2>
        <p className="mt-2">
          你主动发布的公开主题、回复和公开资源可能被其他用户及搜索引擎访问。
          手机号和其他非公开账号安全信息不会随公开社区内容展示。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">查询、更正、删除与注销</h2>
        <p className="mt-2">
          如需查询、更正或删除与账号相关的个人信息，或需要注销账号，请通过站内反馈渠道联系管理员。
          我们会结合账号状态、社区数据及依法需要继续保存的信息处理相关请求。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">相关规则</h2>
        <p className="mt-2">
          使用 MDTBBS 时还应阅读
          <Link href="/terms" className="mx-1 text-[var(--primary-text)] underline underline-offset-2">
            《服务条款》
          </Link>
          。手机号安全验证页面会以更直观的方式说明验证目的和相关法规依据。
        </p>
      </section>
    </div>
  );
}

export default async function PrivacyPage() {
  const locale = await getRequestLocale();
  const siteName = getServerSiteName();
  const club = siteProfile.profile === 'mindustry-club';
  return (
    <ConfiguredFooterPage
      eyebrow={club ? siteName : 'Privacy'}
      title={club ? translate(locale, 'legal.privacy.title') : '隐私政策'}
      settingKey="footer_privacy_content"
      preferFallback={club}
      fallback={club ? <ClubLegalDocument document="privacy" locale={locale} siteName={siteName} /> : <MdtbbsPrivacyFallback />}
    />
  );
}
