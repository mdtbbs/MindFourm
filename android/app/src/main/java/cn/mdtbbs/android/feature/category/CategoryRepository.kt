package cn.mdtbbs.android.feature.category
import cn.mdtbbs.android.core.model.Category
import cn.mdtbbs.android.core.network.MdtBbsApi
import javax.inject.Inject
class CategoryRepository @Inject constructor(private val api: MdtBbsApi) {
 suspend fun categories(): List<Category> = api.categories().data.map { Category(it.id.toString(), it.name, it.slug) }
}
