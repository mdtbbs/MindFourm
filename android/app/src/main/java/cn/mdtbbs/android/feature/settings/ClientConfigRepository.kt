package cn.mdtbbs.android.feature.settings
import cn.mdtbbs.android.core.model.ClientConfig
import cn.mdtbbs.android.core.network.MdtBbsApi
import javax.inject.Inject
import javax.inject.Singleton
@Singleton class ClientConfigRepository @Inject constructor(private val api: MdtBbsApi) {
 suspend fun load(): ClientConfig { val value = api.clientConfig().data; return ClientConfig(value.minimumVersionCode, value.latestVersionCode, value.forceUpdate, value.maintenance, value.features.posting) }
}
