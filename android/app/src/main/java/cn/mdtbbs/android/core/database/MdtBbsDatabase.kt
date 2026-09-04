package cn.mdtbbs.android.core.database

import androidx.paging.PagingSource
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase

/**
 * A thread is stored once per list query. This deliberately keeps the home and
 * category feeds independent: a refresh of one feed must never clear another
 * feed's rows or cursor.
 */
@Entity(tableName = "threads", primaryKeys = ["queryKey", "id"])
data class ThreadEntity(
    val queryKey: String,
    val id: String,
    val title: String,
    val excerpt: String?,
    val authorId: String,
    val authorName: String,
    val authorAvatarUrl: String?,
    val categoryId: String?,
    val categoryName: String?,
    val categorySlug: String?,
    val tagsJson: String,
    val createdAt: String,
    val updatedAt: String,
    val replyCount: Int,
    val viewCount: Int,
)

@Entity(tableName = "categories")
data class CategoryEntity(@PrimaryKey val id: String, val name: String, val slug: String)

@Entity(tableName = "remote_keys")
data class RemoteKeyEntity(
    @PrimaryKey val queryKey: String,
    val nextCursor: String?,
    val hasMore: Boolean,
)

@Dao
interface ThreadDao {
    @Query("SELECT * FROM threads WHERE queryKey = :queryKey ORDER BY createdAt DESC, id DESC")
    fun paging(queryKey: String): PagingSource<Int, ThreadEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(items: List<ThreadEntity>)

    @Query("DELETE FROM threads WHERE queryKey = :queryKey")
    suspend fun clearQuery(queryKey: String)
}

@Dao
interface RemoteKeyDao {
    @Query("SELECT * FROM remote_keys WHERE queryKey = :queryKey")
    suspend fun get(queryKey: String): RemoteKeyEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(key: RemoteKeyEntity)

    @Query("DELETE FROM remote_keys WHERE queryKey = :queryKey")
    suspend fun clearQuery(queryKey: String)
}

@Database(entities = [ThreadEntity::class, CategoryEntity::class, RemoteKeyEntity::class], version = 1, exportSchema = false)
abstract class MdtBbsDatabase : RoomDatabase() {
    abstract fun threads(): ThreadDao
    abstract fun keys(): RemoteKeyDao
}
