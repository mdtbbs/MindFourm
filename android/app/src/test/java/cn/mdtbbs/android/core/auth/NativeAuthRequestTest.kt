package cn.mdtbbs.android.core.auth

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeAuthRequestTest {
    @Test fun transactionRequestAlwaysIncludesS256Method() {
        val payload = Json.encodeToJsonElement(
            CreateTransactionRequest.serializer(),
            CreateTransactionRequest("mdtbbs_android", "a".repeat(43), "S256"),
        ).jsonObject

        assertEquals("S256", payload["code_challenge_method"]?.jsonPrimitive?.content)
    }
}
