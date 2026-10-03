import { Metadata } from 'next';
import Link from 'next/link';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import ClubLegalDocument from '@/components/forum/club-legal-document';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

const DESCRIPTION = '使用本站时需遵守的服务条款与社区规则';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const club = siteProfile.profile === 'mindustry-club';
  const title = club ? translate(locale, 'legal.terms.title') : '服务条款';
  const description = club ? title : DESCRIPTION;
  return {
    title,
    description,
    alternates: { canonical: '/terms' },
    openGraph: {
      title,
      description,
      type: 'website',
      url: '/terms',
    },
  };
}

function MdtbbsTermsFallback() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold">使用社区</h2>
        <p className="mt-2">
          使用像素工厂中文论坛（MDTBBS）时，请遵守适用法律法规、社区规则和基本讨论秩序，
          不得发布违法、侵权、恶意攻击、欺诈或破坏社区和服务安全的内容。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">账号与手机号安全验证</h2>
        <p className="mt-2">
          MDTBBS 通过 MindAuth 提供账号登录。使用主题发布、回复、资源提交等需要验证的社区功能时，
          国内站用户需要按站点要求完成手机号安全验证。
        </p>
        <p className="mt-2">
          手机号安全验证使用中国大陆手机号 + 短信验证码完成。相关法规要求、验证目的和个人信息处理方式
          会在验证页面明确说明。具体个人信息处理规则请参阅
          <Link href="/privacy" className="mx-1 text-[var(--primary)] underline underline-offset-2">
            《隐私政策》
          </Link>
          。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">用户内容</h2>
        <p className="mt-2">
          你应确保上传或发布的文字、图片、附件、地图、蓝图、Mod 等内容拥有合法来源和必要授权。
          为运营社区、展示内容、处理举报和维护备份，本站会在提供服务所必要的范围内处理相关内容。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">审核与安全</h2>
        <p className="mt-2">
          为处理违法违规内容、侵权投诉、垃圾信息、恶意文件、账号滥用和其他安全风险，
          管理员可以依据社区规则采取隐藏、下架、限制操作或账号处置等必要措施。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">服务变更</h2>
        <p className="mt-2">
          MDTBBS 是由 Mindustry 玩家运营的非官方社区。站点功能、规则和技术实现可能随社区运营、
          安全要求及适用规则变化而调整；涉及重要条款或个人信息处理规则变化时，会按适用要求进行说明。
        </p>
      </section>
    </div>
  );
}

export default async function TermsPage() {
  const locale = await getRequestLocale();
  const club = siteProfile.profile === 'mindustry-club';
  return (
    <ConfiguredFooterPage
      eyebrow={club ? 'Mindustry Club' : 'Terms'}
      title={club ? translate(locale, 'legal.terms.title') : '服务条款'}
      settingKey="footer_terms_content"
      preferFallback={club}
      fallback={club ? <ClubLegalDocument document="terms" locale={locale} /> : <MdtbbsTermsFallback />}
    />
  );
}
