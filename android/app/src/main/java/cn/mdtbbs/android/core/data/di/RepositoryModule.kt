package cn.mdtbbs.android.core.data.di

import cn.mdtbbs.android.core.data.OfflineFirstThreadRepository
import cn.mdtbbs.android.core.data.ThreadRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    abstract fun bindThreadRepository(implementation: OfflineFirstThreadRepository): ThreadRepository
}
