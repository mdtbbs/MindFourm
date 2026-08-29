package cn.mdtbbs.android.core.database.di
import android.content.Context
import androidx.room.Room
import cn.mdtbbs.android.core.database.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
@Module @InstallIn(SingletonComponent::class) object DatabaseModule {
 @Provides @Singleton fun database(@ApplicationContext context: Context): MdtBbsDatabase = Room.databaseBuilder(context, MdtBbsDatabase::class.java, "mdtbbs.db").build()
 @Provides fun threads(db: MdtBbsDatabase) = db.threads()
 @Provides fun keys(db: MdtBbsDatabase) = db.keys()
}
