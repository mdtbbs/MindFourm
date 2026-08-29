package cn.mdtbbs.android.core.network
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
@Serializable data class V1Envelope<T>(val data: T, val meta: V1Meta)
@Serializable data class V1Meta(@SerialName("request_id") val requestId: String, val pagination: PaginationMeta? = null)
@Serializable data class PaginationMeta(val page: Int, val limit: Int, val total: Int, @SerialName("total_pages") val totalPages: Int)
@Serializable data class V1ErrorResponse(val error: V1Error, val meta: V1Meta)
@Serializable data class V1Error(val code: String, val message: String, val retryable: Boolean, val details: List<String> = emptyList())
