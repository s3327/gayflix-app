-- CreateTable
CREATE TABLE "sign_in_device" (
    "userId" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sign_in_device_pkey" PRIMARY KEY ("userId","device")
);

-- AddForeignKey
ALTER TABLE "sign_in_device" ADD CONSTRAINT "sign_in_device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
